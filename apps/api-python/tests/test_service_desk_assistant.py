import asyncio
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.domains.service_desk_assistant import (
    MAX_SECTION_CHARS,
    MAX_SOURCE_CHARS,
    _pick_sections,
    knowledge_applications,
    knowledge_sources,
    knowledge_terms,
    split_sections,
)
from tests.document_review_support import add_member


def test_terms_are_folded_distinct_and_safe_for_tsquery():
    assert knowledge_terms('Làm sao để ĐĂNG NHẬP vào Đăng nhập?') == ['dang', 'nhap', 'vao']
    # Decomposed input (macOS) folds like composed input.
    # VI: Đầu vào dạng tách dấu (macOS) được bỏ dấu giống dạng dựng sẵn.
    assert knowledge_terms('Đăng nhập') == ['dang', 'nhap']
    assert knowledge_terms("reset & !password | ':*") == ['reset', 'password']
    assert knowledge_terms('là gì ?') == []
    assert len(knowledge_terms(' '.join(f'word{index}' for index in range(40)))) == 20


def test_sections_follow_headings_outside_code():
    content = '\n'.join([
        'Intro text',
        '# Login',
        '## Forgot password',
        'Use the reset link.',
        '```',
        '# not a heading',
        '```',
        '## Empty',
        '# Other',
        'Other text',
    ])
    sections = split_sections('Guide', content)
    assert [heading for heading, _ in sections] == ['Guide', 'Login › Forgot password', 'Other']
    assert '# not a heading' in sections[1][1]


def document(document_id, content, rank=0.1, title='Guide'):
    return {
        'document_id': document_id, 'release': 1, 'title': title, 'content': content,
        'project_id': 'p', 'project_name': 'App', 'rank': rank, 'can_open': False,
    }


def test_sections_need_two_terms_and_respect_the_budget():
    weak = document('weak', '# Only\nreset everything')
    long = document('long', '# Long\n' + 'reset password ' * 1_000)
    short = document('short', '# Short\nreset password here')
    picked = _pick_sections([weak, long, short], ['reset', 'password'])
    assert [source['documentId'] for source in picked] == ['long', 'short']
    assert [source['id'] for source in picked] == ['S1', 'S2']
    assert len(picked[0]['excerpt']) == MAX_SECTION_CHARS
    many = [document(f'd{index}', '# A\nreset password ' + 'x' * 2_900) for index in range(10)]
    picked = _pick_sections(many, ['reset', 'password'])
    assert sum(len(source['excerpt']) for source in picked) <= MAX_SOURCE_CHARS
    assert len(picked) == 4


@pytest.mark.skipif(not os.getenv('MCP_TEST_DATABASE_URL'), reason='Test database not configured')
def test_knowledge_scope_only_reaches_latest_approved_guides_and_fds():
    asyncio.run(verify_scope())


async def add_project(db, workspace, team, *, enabled=True, archived=False):
    project_id = _cuid()
    await db.execute(
        text("""INSERT INTO projects(id,workspace_id,team_id,name,identifier,slug,service_desk_enabled,archived_at,created_at,updated_at)
        VALUES (:id,:workspace,:team,:name,:identifier,:slug,:enabled,:archived,:now,:now)"""),
        {
            'id': project_id, 'workspace': workspace, 'team': team, 'name': 'App ' + project_id[-6:],
            'identifier': project_id[-6:].upper(), 'slug': project_id[-12:], 'enabled': enabled,
            'archived': _utcnow() if archived else None, 'now': _utcnow(),
        },
    )
    folder_id = _cuid()
    await db.execute(
        text("""INSERT INTO document_folders(id,workspace_id,team_id,project_id,kind,name,created_at,updated_at)
        VALUES (:id,:workspace,:team,:project,'project',:name,:now,:now)"""),
        {'id': folder_id, 'workspace': workspace, 'team': team, 'project': project_id, 'name': 'Docs', 'now': _utcnow()},
    )
    return project_id, folder_id


async def add_document(db, workspace, team, folder, author, content, *, doc_type='GUIDE', status='APPROVED'):
    # Inserting an Approved document makes the database trigger write release v1.
    # VI: Thêm tài liệu Đã duyệt thì trigger của DB ghi bản phát hành v1.
    document_id = _cuid()
    await db.execute(
        text("""INSERT INTO documents(id,workspace_id,team_id,folder_id,title,content,doc_type,status,created_by,updated_by,created_at,updated_at)
        VALUES (:id,:workspace,:team,:folder,:title,:content,:type,:status,:author,:author,:now,:now)"""),
        {
            'id': document_id, 'workspace': workspace, 'team': team, 'folder': folder, 'title': 'Hướng dẫn',
            'content': content, 'type': doc_type, 'status': status, 'author': author, 'now': _utcnow(),
        },
    )
    return document_id


async def verify_scope():
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            now = _utcnow()
            owner = {'id': _cuid(), 'name': 'Owner'}
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**owner, 'email': _cuid() + '@example.test', 'now': now},
            )
            seed = await create_workspace_bootstrap(
                db, user_id=owner['id'], organization_name='Desk', workspace_name=_cuid(), now=now
            )
            workspace, team = seed['workspace_id'], seed['team_id']
            member = await add_member(db, workspace, team, name='Member')
            requester = await add_member(db, workspace, None, name='Requester')
            author = owner['id']
            body = '# Đăng nhập\n## Quên mật khẩu\nBấm "Quên mật khẩu" để nhận email đặt lại mật khẩu.'

            app, folder = await add_project(db, workspace, team)
            guide = await add_document(db, workspace, team, folder, author, body)
            fds = await add_document(db, workspace, team, folder, author, body, doc_type='FDS')
            excluded = {
                await add_document(db, workspace, team, folder, author, body, doc_type=kind)
                for kind in ('TDS', 'ADR', 'RCA', 'OTHER')
            }
            excluded.add(await add_document(db, workspace, team, folder, author, body, status='DRAFT'))
            excluded.add(await add_document(db, workspace, team, folder, author, body, status='IN_REVIEW'))
            archived_document = await add_document(db, workspace, team, folder, author, body)
            await db.execute(text('UPDATE documents SET archived_at = :now WHERE id = :id'), {'now': now, 'id': archived_document})
            excluded.add(archived_document)
            excluded.add(await add_document(db, workspace, team, None, author, body))
            _, closed_folder = await add_project(db, workspace, team, enabled=False)
            excluded.add(await add_document(db, workspace, team, closed_folder, author, body))
            _, archived_folder = await add_project(db, workspace, team, archived=True)
            excluded.add(await add_document(db, workspace, team, archived_folder, author, body))

            other_team = _cuid()
            await db.execute(
                text("""INSERT INTO teams(id,workspace_id,name,identifier,archived_at,created_at,updated_at)
                VALUES (:id,:workspace,'Old','OLD' || substr(:id, 20),:now,:now,:now)"""),
                {'id': other_team, 'workspace': workspace, 'now': now},
            )
            _, old_team_folder = await add_project(db, workspace, other_team)
            excluded.add(await add_document(db, workspace, other_team, old_team_folder, author, body))

            # An edit after approval stays out until it is approved again; then v2 replaces v1.
            # VI: Nội dung sửa sau khi duyệt chưa được dùng cho tới khi duyệt lại; khi đó v2 thay v1.
            await db.execute(
                text("UPDATE documents SET content = :content WHERE id = :id"),
                {'id': guide, 'content': body + '\nMã khôi phục chưa duyệt.'},
            )
            await db.commit()

            found = await knowledge_sources(db, workspace, member['id'], 'quen mat khau thi lam sao?')
            assert {source['documentId'] for source in found} == {guide, fds}
            assert all(source['projectId'] == app and source['heading'] == 'Đăng nhập › Quên mật khẩu' for source in found)
            assert all(source['canOpen'] for source in found)
            accented = await knowledge_sources(db, workspace, requester['id'], 'Quên mật khẩu thì làm sao?')
            assert [source['documentId'] for source in accented] == [source['documentId'] for source in found]
            assert not any(source['canOpen'] for source in accented)
            assert await knowledge_sources(db, workspace, member['id'], 'ma khoi phuc chua duyet') == []

            await db.execute(text("UPDATE documents SET status = 'APPROVED' WHERE id = :id"), {'id': guide})
            await db.commit()
            restored = await knowledge_sources(db, workspace, member['id'], 'ma khoi phuc chua duyet')
            assert [(source['documentId'], source['release']) for source in restored] == [(guide, 2)]
            assert await knowledge_sources(db, workspace, member['id'], 'là gì?') == []

            assert await knowledge_applications(db, workspace) == [
                {'projectId': app, 'name': 'App ' + app[-6:]}
            ]
            leaked = {source['documentId'] for source in await knowledge_sources(db, workspace, member['id'], 'dang nhap quen mat khau email')}
            assert not leaked & excluded
    finally:
        await engine.dispose()
