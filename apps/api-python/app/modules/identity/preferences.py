import json
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict, field_validator
from sqlalchemy import text
from fastapi import Depends
from ...core.utc_responses import UtcAPIRouter
from ...core.errors import ApiError
from ...core.clock import _utcnow
from ...db.session import get_session
from ...domains.auth import current_user
from ...core.timezones import time_zone

router = UtcAPIRouter(
    prefix="/api/v1/users/me/ui-preferences", tags=["account-preferences"]
)


class UiValues(BaseModel):
    model_config = ConfigDict(extra="forbid")
    locale: Literal["en", "vi"] = "en"
    commentSubmitMode: Literal["modifier-enter", "enter"] = "modifier-enter"
    defaultHome: Literal["inbox", "my-issues"] = "inbox"
    defaultWorkspaceId: str | None = Field(default=None, min_length=1, max_length=100)
    fontSize: Literal["default", "small", "large"] = "default"
    pointerCursors: bool = True
    underlineLinks: bool = False
    timezone: str | None = Field(default=None, max_length=100)
    weekStart: Literal[0, 1, 6] = 1
    autoAssignSelf: bool = False

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value):
        if value is None:
            return None
        normalized = {"Asia/Saigon": "Asia/Ho_Chi_Minh"}.get(
            value.strip(), value.strip()
        )
        time_zone(normalized)
        return normalized


class PreferencesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedVersion: int = Field(ge=0)
    accountId: str = Field(min_length=1, max_length=100)
    values: UiValues


async def read_preferences(db, user_id):
    row = (
        (
            await db.execute(
                text(
                    "SELECT preferences,version FROM user_ui_preferences WHERE user_id=:user"
                ),
                {"user": user_id},
            )
        )
        .mappings()
        .first()
    )
    return {
        "accountId": user_id,
        "values": UiValues.model_validate(
            row["preferences"] if row else {}
        ).model_dump(),
        "version": row["version"] if row else 0,
    }


async def write_preferences(db, user_id, payload):
    if payload.accountId != user_id:
        raise ApiError(
            409, "Your account changed. Reload preferences before saving.", "Conflict"
        )
    params = {
        "user": user_id,
        "values": json.dumps(payload.values.model_dump(exclude_unset=True)),
        "expected": payload.expectedVersion,
        "now": _utcnow(),
    }
    query = (
        "INSERT INTO user_ui_preferences(user_id,preferences,updated_at) VALUES (:user,CAST(:values AS jsonb),:now) ON CONFLICT(user_id) DO NOTHING RETURNING version,preferences"
        if payload.expectedVersion == 0
        else "UPDATE user_ui_preferences SET preferences=preferences || CAST(:values AS jsonb),version=version+1,updated_at=:now WHERE user_id=:user AND version=:expected RETURNING version,preferences"
    )
    saved = (await db.execute(text(query), params)).mappings().first()
    if saved is None:
        raise ApiError(
            409,
            "Preferences changed on another device. Reload before saving.",
            "Conflict",
        )
    values = UiValues.model_validate(saved["preferences"]).model_dump()
    if "timezone" in payload.values.model_fields_set and values["timezone"]:
        await db.execute(
            text("UPDATE users SET timezone=:zone,updated_at=:now WHERE id=:user"),
            {"zone": values["timezone"], "now": params["now"], "user": user_id},
        )
    return {
        "values": values,
        "version": saved["version"],
        "accountId": user_id,
    }


@router.get("")
async def get_preferences(user=Depends(current_user), db=Depends(get_session)):
    return {"data": await read_preferences(db, user["id"])}


@router.put("")
async def put_preferences(
    payload: PreferencesUpdate, user=Depends(current_user), db=Depends(get_session)
):
    result = await write_preferences(db, user["id"], payload)
    await db.commit()
    return {"data": result}
