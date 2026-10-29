import asyncio
import json
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.work_items.issue_search import search_page


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
def test_every_issue_filter_dimension_filters_the_whole_scope():
    asyncio.run(verify_filters())


async def verify_filters():
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            user = _cuid()
            await db.execute(text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Filter owner',:email,'ACTIVE',:now,:now)"), {'id': user, 'email': _cuid() + '@example.test', 'now': now})
            seed = await create_workspace_bootstrap(db, user_id=user, organization_name='Filters', workspace_name=_cuid(), now=now)
            workspace, team = seed['workspace_id'], seed['team_id']
            statuses = dict((await db.execute(text("SELECT DISTINCT ON (category) category::text, id FROM issue_statuses WHERE workspace_id=:workspace ORDER BY category, position"), {'workspace': workspace})).all())
            project, other_project, cycle, red, blue = (_cuid() for _ in range(5))
            for project_id in (project, other_project):
                await db.execute(text("INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:id,:id,:now,:now)"), {'id': project_id, 'workspace': workspace, 'now': now})
            await db.execute(text("INSERT INTO cycles(id,workspace_id,team_id,name,created_at,updated_at) VALUES (:id,:workspace,:team,'Cycle 1',:now,:now)"), {'id': cycle, 'workspace': workspace, 'team': team, 'now': now})
            for label in (red, blue):
                await db.execute(text("INSERT INTO labels(id,workspace_id,name,color,created_at,updated_at) VALUES (:id,:workspace,:id,'#f00',:now,:now)"), {'id': label, 'workspace': workspace, 'now': now})
            # Fixture issues: one row per combination the filters must tell apart.
            # VI: Task mẫu: mỗi dòng là một tổ hợp mà bộ lọc phải phân biệt được.
            fixtures = [
                ('A', 'UNSTARTED', user, 'HIGH', [red, blue], project, cycle, 'BUG', 'HIGH'),
                ('B', 'STARTED', None, 'NONE', [red], None, None, 'TASK', None),
                ('C', 'UNSTARTED', None, 'LOW', [], other_project, None, 'TASK', None),
                ('D', 'STARTED', user, 'HIGH', [blue], None, cycle, 'TASK', None),
            ]
            for number, (name, category, assignee, priority, labels, project_id, cycle_id, issue_type, severity) in enumerate(fixtures, 1):
                issue = _cuid()
                await db.execute(text('''INSERT INTO issues(id,workspace_id,team_id,status_id,identifier,number,title,priority,assignee_id,project_id,issue_type,severity,creator_id,created_at,updated_at)
                    VALUES (:id,:workspace,:team,:status,:identifier,:number,:title,CAST(:priority AS "IssuePriority"),:assignee,:project,CAST(:issue_type AS "IssueType"),CAST(:severity AS "BugSeverity"),:user,:now,:now)'''),
                    {'id': issue, 'workspace': workspace, 'team': team, 'status': statuses[category], 'identifier': f'FLT-{name}', 'number': number, 'title': name,
                     'priority': priority, 'assignee': assignee, 'project': project_id, 'issue_type': issue_type, 'severity': severity, 'user': user, 'now': now})
                for label in labels:
                    await db.execute(text('INSERT INTO issue_labels(issue_id,label_id) VALUES (:issue,:label)'), {'issue': issue, 'label': label})
                if cycle_id:
                    await db.execute(text('INSERT INTO issue_cycles(issue_id,cycle_id) VALUES (:issue,:cycle)'), {'issue': issue, 'cycle': cycle_id})

            async def names(*filters):
                options = {'limit': 100, 'includeSubIssues': True, 'filters': json.dumps([
                    {'columnId': column, 'type': 'multiOption' if column == 'labels' else 'option', 'operator': operator, 'values': values}
                    for column, operator, values in filters
                ])}
                page = await search_page(db, workspace, user, 'filter-secret', options)
                return ''.join(sorted(row['title'] for row in page['data']))

            assert await names() == 'ABCD'
            assert await names(('status', 'is', [statuses['UNSTARTED']])) == 'AC'
            assert await names(('statusType', 'is', ['started'])) == 'BD'
            assert await names(('assignee', 'is', ['unassigned'])) == 'BC'
            assert await names(('assignee', 'is not', [user])) == 'BC'
            assert await names(('priority', 'is', ['no-priority'])) == 'B'
            assert await names(('priority', 'is any of', ['high', 'low'])) == 'ACD'
            assert await names(('labels', 'include', [red])) == 'AB'
            assert await names(('labels', 'exclude', [red])) == 'CD'
            assert await names(('labels', 'include all of', [red, blue])) == 'A'
            assert await names(('labels', 'exclude if all', [red, blue])) == 'BCD'
            assert await names(('project', 'is', [project])) == 'A'
            assert await names(('project', 'is not', [project])) == 'BCD'
            assert await names(('project', 'is not', [''])) == 'AC'
            assert await names(('cycle', 'is', ['no-cycle'])) == 'BC'
            assert await names(('cycle', 'is not', [cycle])) == 'BC'
            assert await names(('issueType', 'is', ['BUG'])) == 'A'
            assert await names(('severity', 'is', ['NONE'])) == 'BCD'
            assert await names(('statusType', 'is', ['started']), ('labels', 'include', [blue])) == 'D'
            with pytest.raises(ApiError) as error:
                await names(('status', 'contains', ['x']))
            assert error.value.status_code == 400
            await db.rollback()
    finally:
        await engine.dispose()
