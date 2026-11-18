"""Outgoing webhooks (DTD-904): admin-only setup, SSRF guard, staging with the change, signed
delivery, retry on 5xx, stop on 4xx and turning off after repeated failures.
VI: Webhook gửi ra ngoài (DTD-904): chỉ quản trị viên cấu hình, chặn SSRF, ghi sự kiện cùng thay
VI: đổi, gửi có chữ ký, thử lại khi 5xx, dừng khi 4xx và tự tắt sau nhiều lần lỗi liên tiếp.
"""

import asyncio
import json
import os
from hashlib import sha256
from hmac import new as new_hmac
from types import SimpleNamespace

import httpx
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.integrations import outgoing_webhooks
from app.modules.integrations.webhooks_api import (
    WebhookInput,
    create_webhook,
    delete_webhook,
    list_deliveries,
    list_webhooks,
    ping_webhook,
    rotate_secret,
    update_webhook,
)
from app.modules.work_items.contracts import CreateIssueInput
from app.modules.work_items.issues import create_issue
from tests.document_review_support import add_member

HOST = 'hooks.flowie-internal.test'


def test_signature_matches_hmac_sha256_of_the_body():
    body = b'{"event":"ping"}'
    expected = 'sha256=' + new_hmac(b'whsec_x', body, sha256).hexdigest()
    assert outgoing_webhooks.signature('whsec_x', body) == expected


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
def test_outgoing_webhooks(monkeypatch):
    monkeypatch.setenv('OUTGOING_WEBHOOK_ALLOWED_HOSTS', f' {HOST.upper()} , other.test')
    asyncio.run(verify_outgoing_webhooks(monkeypatch))


async def expect_error(status, call):
    with pytest.raises(ApiError) as caught:
        await call
    assert caught.value.status_code == status, caught.value


async def verify_outgoing_webhooks(monkeypatch):
    received: list[httpx.Request] = []
    answers: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        received.append(request)
        return httpx.Response(answers.pop(0) if answers else 200)

    real_client = httpx.AsyncClient
    monkeypatch.setattr(
        outgoing_webhooks,
        'httpx',
        SimpleNamespace(
            AsyncClient=lambda **options: real_client(transport=httpx.MockTransport(handler), **options),
            TimeoutException=httpx.TimeoutException,
            HTTPError=httpx.HTTPError,
        ),
    )
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    factory = async_sessionmaker(engine)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(session_factory=factory)))
    try:
        async with factory() as db:
            now, owner = utcnow(), {'id': cuid(), 'name': 'Owner'}
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**owner, 'email': cuid() + '@example.test', 'now': now},
            )
            seed = await create_workspace_bootstrap(
                db, user_id=owner['id'], organization_name='Hooks', workspace_name=cuid(), now=now
            )
            workspace, team = seed['workspace_id'], seed['team_id']
            member = await add_member(db, workspace, team, name='Member')
            await db.commit()

            def body(**changes):
                values = {'name': 'TAM', 'url': f'https://{HOST}/flowie', 'events': ['issue.created']}
                return WebhookInput(**{**values, **changes})

            # Only administrators configure; unsafe URLs and unknown events are refused.
            # VI: Chỉ quản trị viên cấu hình; URL không an toàn và sự kiện lạ bị từ chối.
            await expect_error(403, create_webhook(body(), workspace, member, db))
            await expect_error(403, list_webhooks(workspace, member, db))
            for url in ('http://example.com/x', 'https://127.0.0.1/x', f'https://user:pw@{HOST}/x', 'https://localhost/x'):
                await expect_error(400, create_webhook(body(url=url), workspace, owner, db))
            await expect_error(400, create_webhook(body(events=['ticket.created']), workspace, owner, db))

            created = (await create_webhook(body(), workspace, owner, db))['data']
            secret = created['secret']
            assert secret.startswith('whsec_') and created['events'] == ['issue.created']
            other = (await create_webhook(body(name='Projects', events=['project.updated']), workspace, owner, db))['data']
            listed = await list_webhooks(workspace, owner, db)
            assert [hook['name'] for hook in listed['data']] == ['TAM', 'Projects']
            assert all('secret' not in hook for hook in listed['data'])
            assert 'issue.comment_created' in listed['meta']['events']

            # The event is staged with the change, only for subscribed webhooks.
            # VI: Sự kiện được ghi cùng thay đổi, chỉ cho webhook đã đăng ký.
            issue = (
                await create_issue(
                    CreateIssueInput(workspaceId=workspace, teamId=team, title='Ship webhooks'), owner, db
                )
            )['data']
            await db.commit()
            staged = (
                await db.execute(
                    text('SELECT webhook_id, event, payload FROM outgoing_webhook_deliveries WHERE webhook_id IN (:a, :b)'),
                    {'a': created['id'], 'b': other['id']},
                )
            ).mappings().all()
            assert [(row['webhook_id'], row['event']) for row in staged] == [(created['id'], 'issue.created')]
            payload = staged[0]['payload']
            assert payload['event'] == 'issue.created' and payload['workspaceId'] == workspace
            assert payload['data']['entityId'] == issue['id'] and payload['data']['actor']['id'] == owner['id']
            assert 'body' not in payload['data']

            # Delivery is signed with the secret and recorded.
            # VI: Lần gửi được ký bằng secret và được ghi lại.
            assert await outgoing_webhooks.deliver_one(factory)
            sent = received[-1]
            assert str(sent.url) == f'https://{HOST}/flowie'
            assert sent.headers['x-flowie-event'] == 'issue.created'
            assert sent.headers['x-flowie-signature'] == outgoing_webhooks.signature(secret, sent.content)
            assert json.loads(sent.content)['id'] == payload['id']
            delivery = (await list_deliveries(created['id'], workspace, owner, db))['data'][0]
            assert delivery['status'] == 200 and delivery['deliveredAt'] and delivery['id'] == sent.headers['x-flowie-delivery']
            assert not await outgoing_webhooks.deliver_one(factory)

            async def stage_one():
                async with factory() as session:
                    await outgoing_webhooks.stage_outgoing_event(session, workspace, 'issue.created', {'n': 1})
                    await session.commit()
                return (
                    await db.execute(
                        text('SELECT id FROM outgoing_webhook_deliveries WHERE webhook_id = :id ORDER BY created_at DESC, id DESC LIMIT 1'),
                        {'id': created['id']},
                    )
                ).scalar_one()

            async def state(delivery_id):
                await db.rollback()
                return (
                    await db.execute(
                        text('''SELECT d.attempts, d.response_status, d.delivered_at, d.failed_at, d.available_at,
                                       w.enabled, w.consecutive_failures, w.disabled_reason
                                FROM outgoing_webhook_deliveries d JOIN outgoing_webhooks w ON w.id = d.webhook_id
                                WHERE d.id = :id'''),
                        {'id': delivery_id},
                    )
                ).mappings().one()

            # 5xx is retried later; a following 2xx clears the failure count; 4xx stops at once.
            # VI: 5xx được thử lại sau; 2xx tiếp theo xoá bộ đếm lỗi; 4xx dừng ngay.
            answers[:] = [503]
            retried = await stage_one()
            assert await outgoing_webhooks.deliver_one(factory, retried)
            row = await state(retried)
            assert row['response_status'] == 503 and row['failed_at'] is None and row['available_at'] > utcnow()
            assert row['consecutive_failures'] == 1
            await db.execute(text('UPDATE outgoing_webhook_deliveries SET available_at = :now WHERE id = :id'), {'id': retried, 'now': utcnow()})
            await db.commit()
            assert await outgoing_webhooks.deliver_one(factory, retried)
            row = await state(retried)
            assert row['delivered_at'] and row['attempts'] == 2 and row['consecutive_failures'] == 0
            answers[:] = [410]
            rejected = await stage_one()
            assert await outgoing_webhooks.deliver_one(factory, rejected)
            assert (await state(rejected))['failed_at'] is not None

            # Too many failures in a row turn the webhook off and drop what is still queued.
            # VI: Lỗi liên tiếp quá nhiều lần thì tắt webhook và bỏ những gì còn trong hàng đợi.
            await db.execute(
                text('UPDATE outgoing_webhooks SET consecutive_failures = :n WHERE id = :id'),
                {'n': outgoing_webhooks.DISABLE_AFTER_FAILURES - 1, 'id': created['id']},
            )
            await db.commit()
            answers[:] = [500]
            last, queued = await stage_one(), await stage_one()
            assert await outgoing_webhooks.deliver_one(factory, last)
            row = await state(last)
            assert row['enabled'] is False and 'failed attempts in a row' in row['disabled_reason']
            assert (await state(queued))['failed_at'] is not None
            async with factory() as session:
                await outgoing_webhooks.stage_outgoing_event(session, workspace, 'issue.created', {'n': 2})
                await session.commit()
            assert not await outgoing_webhooks.deliver_one(factory)

            # A test ping is sent while off, tried once, and leaves the failure count alone.
            # VI: Ping thử vẫn gửi khi đang tắt, chỉ thử một lần và không đổi bộ đếm lỗi.
            answers[:] = [500]
            ping = (await ping_webhook(created['id'], request, workspace, owner, db))['data']
            assert ping['event'] == 'ping' and ping['status'] == 500 and ping['failedAt']
            assert json.loads(received[-1].content)['data']['webhookId'] == created['id']

            # Turning it back on clears the failure state; rotating replaces the secret.
            # VI: Bật lại thì xoá trạng thái lỗi; đổi secret thì thay secret mới.
            on = (await update_webhook(created['id'], body(enabled=True), workspace, owner, db))['data']
            assert on['enabled'] and on['consecutiveFailures'] == 0 and on['disabledReason'] is None
            rotated = (await rotate_secret(created['id'], workspace, owner, db))['data']['secret']
            assert rotated != secret
            await ping_webhook(created['id'], request, workspace, owner, db)
            assert received[-1].headers['x-flowie-signature'] == outgoing_webhooks.signature(rotated, received[-1].content)

            await expect_error(403, update_webhook(created['id'], body(), cuid(), owner, db))
            await delete_webhook(created['id'], workspace, owner, db)
            await expect_error(404, list_deliveries(created['id'], workspace, owner, db))
    finally:
        await engine.dispose()
