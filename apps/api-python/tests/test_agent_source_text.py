import asyncio
import os
from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.identifiers import cuid
from app.modules.agent.api import _conversation_source_text, _persist_turn
from app.modules.identity.auth import create_workspace_bootstrap


async def _turn(db, conversation_id, workspace, user_id, is_new, source_text=None):
    return await _persist_turn(
        db,
        conversation_id=conversation_id,
        conversation={'id': conversation_id, 'title': 'Plan'},
        workspace_id=workspace,
        user_id=user_id,
        is_new_conversation=is_new,
        user_content='Lập kế hoạch',
        assistant_content='Cần thêm thông tin',
        proposal={'summary': 'Cần thêm thông tin'},
        source_text=source_text,
    )


def test_source_text_follows_the_planning_turns_of_a_conversation():
    asyncio.run(verify_source_text())


async def verify_source_text():
    engine = create_async_engine(_async_database_url(os.environ['MCP_TEST_DATABASE_URL']))
    try:
        async with async_sessionmaker(engine)() as db:
            now = utcnow()
            user_id = cuid()
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Agent',:email,'ACTIVE',:now,:now)"),
                {'id': user_id, 'email': cuid() + '@example.test', 'now': now},
            )
            workspace = (
                await create_workspace_bootstrap(
                    db, user_id=user_id, organization_name='Agent', workspace_name=cuid(), now=now
                )
            )['workspace_id']
            conversation = cuid()

            first = await _turn(db, conversation, workspace, user_id, True, 'first file')
            assert 'source_text' not in first['userMessage'] and 'sourceText' not in first['userMessage']
            await asyncio.sleep(0.01)
            await _turn(db, conversation, workspace, user_id, False)
            await asyncio.sleep(0.01)
            await _turn(db, conversation, workspace, user_id, False, 'second file')
            assert await _conversation_source_text(db, conversation) == 'second file\n\nfirst file'

            # Applying a proposal closes that plan, so its files stop feeding new planning turns.
            # VI: Áp dụng đề xuất là đóng kế hoạch đó, nên file của nó không còn dùng cho lượt mới.
            await db.execute(
                text('UPDATE agent_messages SET applied_at = :at WHERE id = :id'),
                {'at': utcnow() + timedelta(seconds=1), 'id': first['message']['id']},
            )
            await db.commit()
            assert await _conversation_source_text(db, conversation) == ''
    finally:
        await engine.dispose()
