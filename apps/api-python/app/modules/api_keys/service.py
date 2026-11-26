"""Workspace API keys: tokens (`flowie_api_...`) that let other systems call Flowie's REST API.

They are separate from MCP connections, which authorize AI clients. Owners and admins manage
them; a key reads its own workspace only within its scopes. Only the SHA-256 hash is stored and
the token is shown once, at creation.
VI: API key của workspace: token (`flowie_api_...`) cho hệ thống khác gọi REST API của Flowie.
VI: Tách khỏi kết nối MCP (dành cho AI client). Owner và admin quản lý; key chỉ đọc workspace
VI: của nó trong phạm vi scope. Chỉ lưu hash SHA-256, token hiện một lần lúc tạo.
"""

from __future__ import annotations

import json
from datetime import timedelta
from secrets import token_urlsafe

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid, hash_token
from ..access.membership import manager
from .commands import (
    AUDIT_INSERT_AUDIT_LOGS,
    CREATE_INSERT_WORKSPACE_API_KEYS,
    DELETE_DELETE_WORKSPACE_API_KEYS,
    REVOKE_UPDATE_WORKSPACE_API_KEYS,
    USE_UPDATE_WORKSPACE_API_KEYS,
)
from .queries import (
    AUTHENTICATE_SELECT_WORKSPACE_API_KEYS,
    LIST_SELECT_WORKSPACE_API_KEYS,
)

PREFIX = "flowie_api_"
SCOPES = frozenset({"news:read"})


class ApiKeyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=80)
    scopes: list[str] = Field(default_factory=lambda: ["news:read"], min_length=1, max_length=10)
    expiresInDays: int = Field(default=90, ge=1, le=365)

    @model_validator(mode="after")
    def validate_key(self):
        if len(self.name.strip()) < 2 or set(self.scopes) - SCOPES:
            raise ValueError("A key name and supported scopes are required.")
        self.name, self.scopes = self.name.strip(), sorted(set(self.scopes))
        return self


def present(row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "prefix": row["prefix"],
        "scopes": row["scopes"],
        "expiresAt": row["expires_at"],
        "revokedAt": row["revoked_at"],
        "lastUsedAt": row["last_used_at"],
        "createdAt": row["created_at"],
        "createdBy": row.get("created_by"),
    }


async def _audit(db: AsyncSession, workspace_id: str, user: dict, action: str, key_id: str, name: str) -> None:
    await db.execute(
        AUDIT_INSERT_AUDIT_LOGS,
        {
            "id": cuid(), "workspace": workspace_id, "user": user["id"], "action": action,
            "key": key_id, "metadata": json.dumps({"name": name}), "now": utcnow(),
        },
    )


async def list_keys(db: AsyncSession, workspace_id: str, user: dict) -> list[dict]:
    await manager(db, workspace_id, user["id"])
    rows = await db.execute(LIST_SELECT_WORKSPACE_API_KEYS, {"workspace": workspace_id})
    return [present(row) for row in rows.mappings()]


async def create(db: AsyncSession, workspace_id: str, user: dict, payload: ApiKeyInput) -> dict:
    await manager(db, workspace_id, user["id"])
    token, now = f"{PREFIX}{token_urlsafe(32)}", utcnow()
    row = (
        await db.execute(
            CREATE_INSERT_WORKSPACE_API_KEYS,
            {
                "id": cuid(), "workspace": workspace_id, "user": user["id"], "name": payload.name,
                "prefix": token[:18], "hash": hash_token(token), "scopes": payload.scopes,
                "expires": now + timedelta(days=payload.expiresInDays), "now": now,
            },
        )
    ).mappings().one()
    await _audit(db, workspace_id, user, "api_key.created", row["id"], payload.name)
    await db.commit()
    return {**present(row), "createdBy": user.get("name"), "token": token}


async def revoke(db: AsyncSession, workspace_id: str, user: dict, key_id: str) -> None:
    await manager(db, workspace_id, user["id"])
    row = (
        await db.execute(
            REVOKE_UPDATE_WORKSPACE_API_KEYS, {"id": key_id, "workspace": workspace_id, "now": utcnow()}
        )
    ).first()
    if not row:
        raise ApiError(404, "Active API key not found.", "Not Found")
    await _audit(db, workspace_id, user, "api_key.revoked", key_id, row[0])
    await db.commit()


async def delete(db: AsyncSession, workspace_id: str, user: dict, key_id: str) -> None:
    await manager(db, workspace_id, user["id"])
    row = (
        await db.execute(
            DELETE_DELETE_WORKSPACE_API_KEYS, {"id": key_id, "workspace": workspace_id, "now": utcnow()}
        )
    ).first()
    if not row:
        raise ApiError(409, "Only a revoked or expired API key can be deleted.", "Conflict")
    await _audit(db, workspace_id, user, "api_key.deleted", key_id, row[0])
    await db.commit()


async def authenticate(db: AsyncSession, token: str, scope: str) -> tuple[str, str, int]:
    """Returns (key id, workspace id, calls this minute) and records the use; the caller commits.
    VI: Trả (id key, id workspace, số lời gọi trong phút này) và ghi lần dùng; nơi gọi commit."""
    if not token.startswith(PREFIX) or len(token) > 128:
        raise ApiError(401, "Invalid API key.", "Unauthorized")
    row = (
        await db.execute(AUTHENTICATE_SELECT_WORKSPACE_API_KEYS, {"hash": hash_token(token), "now": utcnow()})
    ).mappings().first()
    if not row:
        raise ApiError(401, "The API key is invalid, expired or revoked.", "Unauthorized")
    if scope not in row["scopes"]:
        raise ApiError(403, f"The API key lacks the {scope} scope.", "Forbidden")
    calls = (await db.execute(USE_UPDATE_WORKSPACE_API_KEYS, {"id": row["id"], "now": utcnow()})).scalar_one()
    return row["id"], row["workspace_id"], calls
