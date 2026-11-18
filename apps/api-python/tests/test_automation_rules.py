"""Team automation rules (DTD-903): lead-only setup with audit, no events without rules, the
"all sub-issues done → parent to Technical Review" rule, bounded rule chains, and a failing rule
that neither undoes the user's change nor blocks another rule.
VI: Rule tự động hoá cấp team (DTD-903): chỉ lead cấu hình và có audit, không có rule thì không ghi
VI: sự kiện, rule "mọi sub-issue xong → task cha sang Technical Review", chuỗi rule có giới hạn, và
VI: rule lỗi không huỷ thay đổi của người dùng cũng không chặn rule khác.
"""

import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.modules.automation import engine as automation
from app.modules.automation.api import (
    RuleInput,
    create_rule,
    delete_rule,
    list_rules,
    update_rule,
)
from app.modules.identity.auth import create_workspace_bootstrap
from app.modules.work_items.contracts import CreateIssueInput, UpdateIssueInput
from app.modules.work_items.issues import create_issue, update_issue
from tests.document_review_support import add_member


def test_conditions_match_every_non_empty_list():
    issue = {'issue_type': 'TASK', 'priority': 'HIGH', 'project_id': None, 'status_id': 's1', 'label_ids': ['a', 'b']}
    assert automation.matches({}, issue)
    assert automation.matches({'priorities': ['HIGH'], 'labelIds': ['b', 'z'], 'issueTypes': []}, issue)
    assert not automation.matches({'priorities': ['LOW']}, issue)
    assert not automation.matches({'labelIds': ['z']}, issue)
    assert not automation.matches({'projectIds': ['p']}, issue)


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
def test_automation_rules():
    asyncio.run(verify_automation_rules())


async def expect_error(status, call):
    with pytest.raises(ApiError) as caught:
        await call
    assert caught.value.status_code == status, caught.value


async def drain(factory) -> int:
    handled = 0
    while await automation.process_one(factory):
        handled += 1
        assert handled < 100, 'automation events never ran out'
    return handled


async def verify_automation_rules():
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    factory = async_sessionmaker(engine)
    try:
        async with factory() as db:
            now, owner = utcnow(), {'id': cuid(), 'name': 'Owner'}
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**owner, 'email': cuid() + '@example.test', 'now': now},
            )
            seed = await create_workspace_bootstrap(
                db, user_id=owner['id'], organization_name='Rules', workspace_name=cuid(), now=now
            )
            workspace, team = seed['workspace_id'], seed['team_id']
            member = await add_member(db, workspace, team, name='Member')
            lead = await add_member(db, workspace, team, team_role='LEAD', name='Lead')
            await db.commit()

            async def new_issue(title, **values):
                created = await create_issue(CreateIssueInput(workspaceId=workspace, teamId=team, title=title, **values), owner, db)
                await db.commit()
                return created['data']

            async def change(issue_id, **values):
                await update_issue(issue_id, UpdateIssueInput(**values), workspace, owner, db)
                await db.commit()

            async def issue_status(issue_id):
                await db.rollback()
                return (await db.execute(text('SELECT status_id FROM issues WHERE id = :id'), {'id': issue_id})).scalar_one()

            async def staged_events():
                await db.rollback()
                return (await db.execute(text('SELECT count(*) FROM automation_events WHERE issue_id IN (SELECT id FROM issues WHERE team_id = :team)'), {'team': team})).scalar_one()

            # Without rules a change writes no automation event.
            # VI: Không có rule thì thay đổi không ghi sự kiện automation nào.
            parent = await new_issue('Release 1')
            assert await staged_events() == 0
            statuses = {
                row['category']: row['id']
                for row in (
                    await db.execute(
                        text('SELECT DISTINCT ON (category) id, category FROM issue_statuses WHERE workspace_id = :w AND team_id IS NULL ORDER BY category, position'),
                        {'w': workspace},
                    )
                ).mappings()
            }
            review = cuid()
            await db.execute(
                text("INSERT INTO issue_statuses(id,workspace_id,name,category,color,position,created_at,updated_at) VALUES (:id,:w,'Technical Review','STARTED','#0af',90,:now,:now)"),
                {'id': review, 'w': workspace, 'now': now},
            )
            await db.commit()

            # Only the team lead or an administrator configures rules; every change is audited.
            # VI: Chỉ lead của team hoặc quản trị viên cấu hình rule; mọi thay đổi đều có audit.
            rollup = RuleInput.model_validate({
                'name': 'Sub-issues done → review',
                'trigger': 'issue.subissues_completed',
                'actions': [{'type': 'set_status', 'statusId': review}, {'type': 'comment', 'body': 'All sub-issues are done.'}],
            })
            await expect_error(403, create_rule(team, rollup, workspace, member, db))
            listed = (await list_rules(team, workspace, member, db))['data']
            assert listed == {'canManage': False, 'rules': [], 'runs': []}
            created = (await create_rule(team, rollup, workspace, lead, db))['data']
            assert created['actor']['id'] == lead['id'] and created['enabled']
            assert (await list_rules(team, workspace, owner, db))['data']['canManage']
            audit = (
                await db.execute(text("SELECT action FROM audit_logs WHERE entity_type = 'automation-rule' AND entity_id = :id"), {'id': created['id']})
            ).scalars().all()
            assert audit == ['automation_rule.created']

            # The rule moves the parent only once its last sub-issue is closed, as the rule's saver.
            # VI: Rule chỉ chuyển task cha khi sub-issue cuối cùng đóng, với tư cách người lưu rule.
            first = await new_issue('Backend', parentIssueId=parent['id'])
            second = await new_issue('Frontend', parentIssueId=parent['id'])
            assert await staged_events() == 0
            await change(first['id'], statusId=statuses['COMPLETED'])
            assert await staged_events() == 1
            await drain(factory)
            assert await issue_status(parent['id']) == parent['statusId']
            await change(second['id'], statusId=statuses['CANCELED'])
            await drain(factory)
            assert await issue_status(parent['id']) == review
            activity = (
                await db.execute(
                    text("SELECT actor_id, data FROM activities WHERE issue_id = :id AND type = 'issue.updated' ORDER BY created_at DESC LIMIT 1"),
                    {'id': parent['id']},
                )
            ).mappings().one()
            assert activity['actor_id'] == lead['id']
            assert activity['data']['automation'] == {'ruleId': created['id'], 'name': 'Sub-issues done → review'}
            comment = (await db.execute(text('SELECT content, author_id FROM comments WHERE issue_id = :id'), {'id': parent['id']})).mappings().one()
            assert comment['content'] == 'All sub-issues are done.' and comment['author_id'] == lead['id']
            runs = (await list_rules(team, workspace, member, db))['data']['runs']
            assert [(run['ruleId'], run['status'], run['issue']['id']) for run in runs] == [(created['id'], 'SUCCEEDED', parent['id'])]

            # Two rules that undo each other stop: a rule never re-fires itself and chains are capped.
            # VI: Hai rule đảo ngược nhau vẫn dừng: rule không tự kích hoạt lại và chuỗi có giới hạn.
            def flip(name, source, target):
                return RuleInput.model_validate({
                    'name': name, 'trigger': 'issue.status_changed',
                    'conditions': {'statusIds': [source]},
                    'actions': [{'type': 'set_status', 'statusId': target}],
                })

            ping = (await create_rule(team, flip('Ping', statuses['UNSTARTED'], statuses['STARTED']), workspace, owner, db))['data']
            pong = (await create_rule(team, flip('Pong', statuses['STARTED'], statuses['UNSTARTED']), workspace, owner, db))['data']
            looping = await new_issue('Loop', statusId=statuses['BACKLOG'])
            await change(looping['id'], statusId=statuses['UNSTARTED'])
            await drain(factory)
            chain = (
                await db.execute(text('SELECT count(*) FROM automation_rule_runs WHERE issue_id = :id'), {'id': looping['id']})
            ).scalar_one()
            # Each event can run both rules (the second sees the first's change), so the bound is
            # two rules per level for MAX_DEPTH + 1 levels; without the cap it would never end.
            # VI: Mỗi sự kiện có thể chạy cả hai rule (rule sau thấy thay đổi của rule trước), nên giới
            # VI: hạn là hai rule cho mỗi mức trong MAX_DEPTH + 1 mức; không có giới hạn sẽ chạy mãi.
            assert automation.MAX_DEPTH + 1 <= chain <= 2 * (automation.MAX_DEPTH + 1)
            for rule in (ping, pong):
                await delete_rule(team, rule['id'], workspace, owner, db)

            # A failing rule is rolled back and logged; the user's change and other rules still apply.
            # VI: Rule lỗi được rollback và ghi lại; thay đổi của người dùng và rule khác vẫn áp dụng.
            label = cuid()
            await db.execute(
                text("INSERT INTO labels(id,workspace_id,name,color,created_at,updated_at) VALUES (:id,:w,'Urgent','#f00',:now,:now)"),
                {'id': label, 'w': workspace, 'now': now},
            )
            await db.commit()
            broken = (await create_rule(team, RuleInput.model_validate({
                'name': 'Broken', 'trigger': 'issue.labeled',
                'actions': [{'type': 'set_status', 'statusId': 'missing-status'}],
            }), workspace, owner, db))['data']
            await create_rule(team, RuleInput.model_validate({
                'name': 'Escalate', 'trigger': 'issue.labeled', 'conditions': {'labelIds': [label]},
                'actions': [{'type': 'set_priority', 'priority': 'URGENT'}],
            }), workspace, owner, db)
            tagged = await new_issue('Hot fix')
            await change(tagged['id'], labelIds=[label])
            await drain(factory)
            await db.rollback()
            row = (await db.execute(text('SELECT priority FROM issues WHERE id = :id'), {'id': tagged['id']})).scalar_one()
            assert row == 'URGENT'
            assert (await db.execute(text('SELECT count(*) FROM issue_labels WHERE issue_id = :id'), {'id': tagged['id']})).scalar_one() == 1
            failed = [run for run in (await list_rules(team, workspace, owner, db))['data']['runs'] if run['ruleId'] == broken['id']]
            assert failed and failed[0]['status'] == 'FAILED' and failed[0]['message']

            # A disabled rule stages nothing; edits and deletes are audited too.
            # VI: Rule đã tắt không ghi sự kiện; sửa và xoá cũng có audit.
            await update_rule(team, broken['id'], RuleInput.model_validate({
                'name': 'Broken', 'enabled': False, 'trigger': 'issue.labeled',
                'actions': [{'type': 'set_status', 'statusId': 'missing-status'}],
            }), workspace, lead, db)
            await delete_rule(team, broken['id'], workspace, lead, db)
            await expect_error(404, delete_rule(team, broken['id'], workspace, lead, db))
            await expect_error(403, delete_rule(team, created['id'], workspace, member, db))
            actions = (
                await db.execute(text("SELECT action FROM audit_logs WHERE entity_id = :id ORDER BY created_at"), {'id': broken['id']})
            ).scalars().all()
            assert actions == ['automation_rule.created', 'automation_rule.updated', 'automation_rule.deleted']
    finally:
        await engine.dispose()
