import asyncio
import os
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.core.config import _async_database_url
from app.core.clock import _utcnow
from app.core.identifiers import _cuid
from app.core.errors import ApiError
from app.modules.identity.preferences import (
    UiValues,
    PreferencesUpdate,
    read_preferences,
    write_preferences,
)


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)
def test_account_preferences_reject_stale_and_cross_account_writes():
    asyncio.run(verify_preferences())


async def verify_preferences():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            user, other, now = _cuid(), _cuid(), _utcnow()
            for identifier in [user, other]:
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,'Preference fixture',:email,'ACTIVE',:now,:now)"
                    ),
                    {
                        "id": identifier,
                        "email": identifier + "@example.test",
                        "now": now,
                    },
                )
            initial = await read_preferences(db, user)
            assert initial["version"] == 0 and initial["values"]["locale"] == "en"
            saved = await write_preferences(
                db,
                user,
                PreferencesUpdate(
                    accountId=user,
                    expectedVersion=0,
                    values=UiValues(locale="vi", defaultHome="my-issues"),
                ),
            )
            assert saved["version"] == 1
            for payload in [
                PreferencesUpdate(accountId=user, expectedVersion=0, values=UiValues()),
                PreferencesUpdate(
                    accountId=other, expectedVersion=1, values=UiValues()
                ),
            ]:
                with pytest.raises(ApiError) as error:
                    await write_preferences(db, user, payload)
                assert error.value.status_code == 409
            assert (await read_preferences(db, user))["values"]["locale"] == "vi"
            assert (await read_preferences(db, other))["values"]["locale"] == "en"
            await db.rollback()
    finally:
        await engine.dispose()
