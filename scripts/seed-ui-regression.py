"""Seed synthetic UI regression data only in a loopback test database."""
import asyncio
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'apps/api-python'))
from app.core.config import _async_database_url
from app.core.clock import _utcnow
from app.domains.auth import _cuid, password_hasher, create_workspace_bootstrap
from app.modules.work_items.contracts import CreateDocumentInput, CreateIssueInput
from app.modules.work_items.documents import create_document
from app.modules.work_items.issues import create_issue


async def main():
    url = os.environ['FLOWIE_E2E_DATABASE_URL']
    parsed = urlsplit(url)
    if parsed.hostname not in {'localhost', '127.0.0.1', '::1'} or parsed.username != 'flowie_test' or not parsed.path.startswith('/flowie_'):
        raise SystemExit('UI fixtures require a loopback flowie_test database named flowie_*.')
    engine = create_async_engine(_async_database_url(url))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    password = 'Synthetic-E2E-Only-2026!'
    try:
        async with factory() as db:
            user = {'id': _cuid(), 'name': 'Regression Owner', 'email': f'{_cuid()}@example.test', 'avatarUrl': None}
            now = _utcnow()
            await db.execute(text("INSERT INTO users(id,name,email,password_hash,status,email_verified_at,created_at,updated_at) VALUES (:id,:name,:email,:password,'ACTIVE',:now,:now,:now)"), {**user, 'password': password_hasher.hash(password), 'now': now})
            seed = await create_workspace_bootstrap(db, user_id=user['id'], organization_name='Regression', workspace_name='UI Regression ' + _cuid(), now=now)
            folder, project = _cuid(), _cuid()
            await db.execute(text("INSERT INTO document_folders(id,workspace_id,team_id,name,created_at,updated_at) VALUES (:id,:workspace,:team,'Regression notes',:now,:now)"), {'id': folder, 'workspace': seed['workspace_id'], 'team': seed['team_id'], 'now': now})
            await db.execute(text("INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:team,'Regression project','REG',:now,:now)"), {'id': project, 'workspace': seed['workspace_id'], 'team': seed['team_id'], 'now': now})
            status = (await db.execute(text("SELECT id FROM issue_statuses WHERE workspace_id=:workspace AND category='UNSTARTED' LIMIT 1"), {'workspace': seed['workspace_id']})).scalar_one()
            issues = []
            for title, assigned in [('Assigned regression task', True), ('Unassigned regression bug', False)]:
                issue = (await create_issue(CreateIssueInput(workspaceId=seed['workspace_id'], teamId=seed['team_id'], projectId=project, title=title, statusId=status, assigneeId=user['id'] if assigned else None), user, db))['data']
                issues.append(issue)
            document = (await create_document(CreateDocumentInput(workspaceId=seed['workspace_id'], teamId=seed['team_id'], folderId=folder, title='Regression Markdown notes', content='# Regression\n\n```python\nprint("safe")\n```\n\n| Status | Count |\n| --- | --- |\n| Open | 2 |\n\n1. Reproduce\n2. Verify\n\n- [x] Fixture ready\n\n<script>alert(1)</script>\n[Unsafe](javascript:alert(1))'), user, db))['data']
            await db.execute(text("INSERT INTO notifications(id,workspace_id,user_id,type,entity_type,entity_id,data,created_at) VALUES (:id,:workspace,:user,'issue.assignment','issue',:issue,CAST(:data AS jsonb),:now)"), {
                'id': _cuid(), 'workspace': seed['workspace_id'], 'user': user['id'], 'issue': issues[0]['id'], 'now': now,
                'data': json.dumps({'title': issues[0]['title'], 'entityPath': '/issue/' + issues[0]['identifier'], 'actor': {'id': user['id'], 'name': user['name']}}),
            })
            await db.commit()
            output = {**seed, 'legacy_slug': seed['slug'], 'slug': seed['slug'], 'userId': user['id'], 'email': user['email'], 'password': password,
                'projectId': project, 'documentId': document['id'], 'documentTitle': document['title'],
                'issues': [{'id': item['id'], 'identifier': item['identifier'], 'title': item['title']} for item in issues]}
            target = ROOT / 'apps/web/.e2e-fixture.json'
            target.write_text(json.dumps(output), encoding='utf-8')
            print(json.dumps({'workspace': seed['workspace_id'], 'fixture': str(target), 'issues': len(issues)}))
    finally:
        await engine.dispose()


asyncio.run(main())
