import asyncio
import os

import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import utcnow
from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.core.identifiers import cuid
from app.modules.identity.preferences import (
    PreferencesUpdate,
    UiValues,
    known_values,
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
            user, other, now = cuid(), cuid(), utcnow()
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
            configured = await write_preferences(
                db,
                user,
                PreferencesUpdate(
                    accountId=user,
                    expectedVersion=1,
                    values=UiValues(
                        timezone="Asia/Saigon", weekStart=6, autoAssignSelf=True,
                        defaultWorkspaceId="preferred-workspace",
                    ),
                ),
            )
            assert configured["values"]["timezone"] == "Asia/Ho_Chi_Minh"
            assert (
                await db.execute(
                    text("SELECT timezone FROM users WHERE id=:user"), {"user": user}
                )
            ).scalar_one() == "Asia/Ho_Chi_Minh"
            # Older cached clients omit newly introduced settings rather than resetting them.
            older = await write_preferences(
                db,
                user,
                PreferencesUpdate(
                    accountId=user, expectedVersion=2, values=UiValues(locale="en")
                ),
            )
            assert (
                older["values"]["timezone"] == "Asia/Ho_Chi_Minh"
                and older["values"]["weekStart"] == 6
                and older["values"]["autoAssignSelf"] is True
            )
            assert older["values"]["defaultHome"] == "my-issues"
            assert older["values"]["defaultWorkspaceId"] == "preferred-workspace"
            automatic = await write_preferences(
                db,
                user,
                PreferencesUpdate(
                    accountId=user, expectedVersion=3, values=UiValues(timezone=None, defaultWorkspaceId=None)
                ),
            )
            assert (
                automatic["values"]["timezone"] is None
                and automatic["values"]["weekStart"] == 6
            )
            assert automatic["values"]["defaultWorkspaceId"] is None
            # The release an account was told about is per account: a new one
            # starts with none, the recorded value survives later writes of
            # unrelated settings, and it never leaks to another account.
            assert initial["values"]["lastSeenReleaseVersion"] is None
            announced = await write_preferences(
                db,
                user,
                PreferencesUpdate(
                    accountId=user,
                    expectedVersion=4,
                    values=UiValues(lastSeenReleaseVersion="0.13.0"),
                ),
            )
            assert announced["values"]["lastSeenReleaseVersion"] == "0.13.0"
            unrelated = await write_preferences(
                db,
                user,
                PreferencesUpdate(
                    accountId=user, expectedVersion=5, values=UiValues(fontSize="large")
                ),
            )
            assert unrelated["values"]["lastSeenReleaseVersion"] == "0.13.0"
            assert (await read_preferences(db, user))["values"][
                "lastSeenReleaseVersion"
            ] == "0.13.0"
            assert (await read_preferences(db, other))["values"][
                "lastSeenReleaseVersion"
            ] is None
            await db.rollback()
    finally:
        await engine.dispose()


def test_stored_preferences_survive_settings_this_build_does_not_know():
    stored = {
        "locale": "vi",
        "lastSeenReleaseVersion": "0.13.0",
        "settingFromANewerRelease": True,
    }
    assert known_values(stored) == {"locale": "vi", "lastSeenReleaseVersion": "0.13.0"}
    assert (
        UiValues.model_validate(known_values(stored)).lastSeenReleaseVersion == "0.13.0"
    )
    assert known_values(None) == {} and known_values({}) == {}
    # Clients still cannot invent settings, only the database may carry extras.
    with pytest.raises(ValidationError):
        UiValues(settingFromANewerRelease=True)


def test_account_timezone_requires_recognized_iana_zone():
    with pytest.raises(ApiError):
        UiValues(timezone="not-a-real-zone")
    assert UiValues(timezone="UTC").timezone == "UTC"
