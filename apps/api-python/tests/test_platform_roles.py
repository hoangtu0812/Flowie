import asyncio
import os
from dataclasses import dataclass
from types import SimpleNamespace

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import (
    _cuid,
    _find_user_by_id,
    _platform_role,
    _runtime_user,
    _utcnow,
)
from app.domains.native_admin import (
    UpdateAdminUserInput,
    audit_logs,
    overview,
    update_user,
    users,
)


@dataclass
class FakeSettings:
    admin_email: str


def test_environment_admin_overrides_any_stored_role():
    settings = FakeSettings('root@example.test')
    assert _platform_role('Root@Example.test', None, settings) == 'SUPER_ADMIN'
    assert _platform_role('root@example.test', 'VIEWER', settings) == 'SUPER_ADMIN'
    assert _platform_role('member@example.test', 'VIEWER', settings) == 'VIEWER'
    assert _platform_role('member@example.test', None, settings) is None


def test_runtime_user_grants_console_access_from_the_stored_role():
    settings = FakeSettings('root@example.test')
    for role, expected in [('SUPER_ADMIN', True), ('VIEWER', True), (None, False)]:
        user = _runtime_user({'email': 'member@example.test', 'platform_role': role}, settings)
        assert user['is_platform_admin'] is expected


def test_omitted_role_differs_from_explicit_revocation():
    assert 'platformRole' not in UpdateAdminUserInput(status='ACTIVE').model_fields_set
    assert 'platformRole' in UpdateAdminUserInput(platformRole=None).model_fields_set


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
def test_platform_role_permissions_and_audit():
    asyncio.run(verify_permissions())


async def verify_permissions():
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    root_email = f'{_cuid()}@example.test'
    settings = FakeSettings(root_email)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=settings)))
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            people = {}
            for name, email, role in [
                ('root', root_email, None),
                ('super', f'{_cuid()}@example.test', 'SUPER_ADMIN'),
                ('viewer', f'{_cuid()}@example.test', 'VIEWER'),
                ('plain', f'{_cuid()}@example.test', None),
            ]:
                people[name] = _cuid()
                await db.execute(
                    text(
                        """INSERT INTO users(id,name,email,status,is_platform_admin,platform_role,created_at,updated_at)
                        VALUES (:id,:name,:email,'ACTIVE',:admin,CAST(:role AS "PlatformRole"),:now,:now)"""
                    ),
                    {
                        'id': people[name],
                        'name': name,
                        'email': email,
                        'admin': role is not None,
                        'role': role,
                        'now': now,
                    },
                )
            await db.commit()

            async def actor(name):
                return _runtime_user(await _find_user_by_id(db, people[name]), settings)

            async def change(by, target, **fields):
                return (
                    await update_user(
                        people[target], UpdateAdminUserInput(**fields), request, await actor(by), db
                    )
                )['data']

            async def refused(code, by, target, **fields):
                with pytest.raises(ApiError) as caught:
                    await change(by, target, **fields)
                assert caught.value.status_code == code

            # View-only administrators read the console but change nothing, including the audit log.
            # VI: Admin chỉ xem đọc được console nhưng không đổi được gì, kể cả không đọc audit log.
            viewer = await actor('viewer')
            assert (await overview(viewer, db))['data']['users'] >= 4
            rows = {row['id']: row for row in (await users(request, viewer, db))['data']}
            assert rows[people['plain']]['manageable'] is False
            await refused(403, 'viewer', 'plain', platformRole='VIEWER')
            await refused(403, 'viewer', 'plain', status='SUSPENDED')
            with pytest.raises(ApiError) as caught:
                await audit_logs(viewer, db)
            assert caught.value.status_code == 403

            # Accounts without a role stay out of the console entirely.
            # VI: Tài khoản không có vai trò hoàn toàn không vào được console.
            with pytest.raises(ApiError) as caught:
                await overview(await actor('plain'), db)
            assert caught.value.status_code == 403
            await refused(403, 'plain', 'plain', platformRole='SUPER_ADMIN')

            # Super admins cannot change themselves or the ADMIN_EMAIL account.
            # VI: Super admin không tự đổi quyền mình và không đổi được tài khoản ADMIN_EMAIL.
            await refused(400, 'super', 'super', platformRole=None)
            await refused(400, 'super', 'root', platformRole=None)
            await refused(400, 'super', 'root', status='SUSPENDED')
            rows = {
                row['id']: row
                for row in (await users(request, await actor('super'), db))['data']
            }
            assert rows[people['root']]['platformRole'] == 'SUPER_ADMIN'
            assert rows[people['root']]['manageable'] is False
            assert rows[people['super']]['manageable'] is False
            assert rows[people['plain']]['manageable'] is True

            # A grant applies on the next request and stays in step with the stored flag.
            # VI: Quyền có hiệu lực từ request kế tiếp và đồng bộ với cờ đã lưu.
            changed = await change('super', 'plain', platformRole='VIEWER')
            assert changed['platformRole'] == 'VIEWER'
            assert (await actor('plain'))['is_platform_admin'] is True
            assert (await overview(await actor('plain'), db))['data']
            stored = (await _find_user_by_id(db, people['plain']))['is_platform_admin']
            assert stored is True

            # Status-only updates keep the role.
            # VI: Cập nhật chỉ trạng thái giữ nguyên vai trò.
            await change('super', 'plain', status='ACTIVE')
            assert (await _find_user_by_id(db, people['plain']))['platform_role'] == 'VIEWER'

            # A second super admin can grant and revoke; revocation applies at once.
            # VI: Super admin thứ hai cũng cấp và thu hồi được; thu hồi có hiệu lực ngay.
            await change('root', 'plain', platformRole='SUPER_ADMIN')
            await change('plain', 'viewer', platformRole=None)
            with pytest.raises(ApiError):
                await overview(await actor('viewer'), db)
            await change('super', 'plain', platformRole=None)
            assert (await _find_user_by_id(db, people['plain']))['is_platform_admin'] is False

            events = (await audit_logs(await actor('root'), db))['data']
            roles = [
                event['metadata']['platformRole']
                for event in events
                if event['entityId'] == people['plain'] and 'platformRole' in event['metadata']
            ]
            assert roles == [
                {'from': 'SUPER_ADMIN', 'to': None},
                {'from': 'VIEWER', 'to': 'SUPER_ADMIN'},
                {'from': None, 'to': 'VIEWER'},
            ]
    finally:
        await engine.dispose()
