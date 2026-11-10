from __future__ import annotations

import json
from datetime import timedelta
from secrets import token_urlsafe

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid, hash_token
from ..access.membership import workspace_role
from .commands import (
    AUTHENTICATE_UPDATE_MCP_CONNECTIONS,
    CREATE_INSERT_AUDIT_LOGS,
    CREATE_INSERT_MCP_CONNECTIONS,
    REVOKE_INSERT_AUDIT_LOGS,
    REVOKE_UPDATE_MCP_CONNECTIONS,
    UPDATE_INSERT_AUDIT_LOGS,
    UPDATE_UPDATE_MCP_CONNECTIONS,
)
from .contracts import ConnectionInput, ConnectionUpdateInput
from .domain import Principal
from .queries import (
    AUTHENTICATE_SELECT_MCP_CONNECTIONS,
    LIST_CONNECTIONS_SELECT_MCP_CONNECTIONS,
    LOAD_PRINCIPAL_SELECT_MCP_CONNECTIONS,
    UPDATE_SELECT_MCP_CONNECTIONS,
    VALIDATE_CURRENT_SELECT_MCP_CONNECTIONS,
)


def present(row) -> dict:
    return {
        "id": row["id"],
        "workspaceId": row["workspace_id"],
        "name": row["name"],
        "prefix": row["prefix"],
        "scopes": row["scopes"],
        "teamIds": row["team_ids"],
        "projectIds": row["project_ids"],
        "expiresAt": row["expires_at"],
        "revokedAt": row["revoked_at"],
        "lastUsedAt": row["last_used_at"],
        "createdAt": row["created_at"],
    }


async def load_principal(db, connection_id: str) -> Principal:
    row = (
        (
            await db.execute(
                LOAD_PRINCIPAL_SELECT_MCP_CONNECTIONS,
                {"id": connection_id, "now": utcnow()},
            )
        )
        .mappings()
        .first()
    )
    if not row:
        raise ApiError(401, "The connection is no longer active.", "Unauthorized")
    return Principal(
        row["id"],
        row["workspace_id"],
        {
            "id": row["user_id"],
            "name": row["user_name"],
            "email": row["email"],
            "avatarUrl": row["avatar_url"],
        },
        frozenset(row["scopes"]),
        tuple(row["team_ids"]),
        tuple(row["project_ids"]),
        row["name"],
    )


async def authenticate(db: AsyncSession, token: str) -> Principal:
    if not token.startswith("flowie_mcp_") or len(token) > 128:
        raise ApiError(401, "Invalid MCP token.", "Unauthorized")
    result = await db.execute(
        AUTHENTICATE_SELECT_MCP_CONNECTIONS,
        {"hash": hash_token(token), "now": utcnow()},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(
            401, "The MCP token is invalid, expired or revoked.", "Unauthorized"
        )
    await db.execute(
        AUTHENTICATE_UPDATE_MCP_CONNECTIONS,
        {"id": row["id"], "now": utcnow()},
    )
    return Principal(
        connection_id=row["id"],
        workspace_id=row["workspace_id"],
        user={
            "id": row["user_id"],
            "name": row["user_name"],
            "email": row["email"],
            "avatarUrl": row["avatar_url"],
        },
        scopes=frozenset(row["scopes"]),
        team_ids=tuple(row["team_ids"]),
        project_ids=tuple(row["project_ids"]),
        connection_name=row["name"],
        instructions=row["mcp_instructions"],
    )


async def validate_current(db: AsyncSession, principal: Principal) -> None:
    # The shared lock prevents a concurrent revocation from completing during a mutation.
    row = (
        await db.execute(
            VALIDATE_CURRENT_SELECT_MCP_CONNECTIONS,
            {"id": principal.connection_id, "now": utcnow()},
        )
    ).first()
    if not row:
        raise ApiError(401, "The MCP connection is no longer active.", "Unauthorized")


async def _validate_grant(db, workspace_id: str, user: dict, payload) -> None:
    # The grant may only name teams and projects the owner can read today.
    # VI: Quyền cấp chỉ được nêu team và dự án mà chủ kết nối đang đọc được.
    from .policy import AccessPolicy

    unrestricted = Principal("", workspace_id, user, frozenset(payload.scopes), (), ())
    policy = AccessPolicy(db, unrestricted)
    for team_id in payload.teamIds:
        await policy.team(team_id)
    for project_id in payload.projectIds:
        project = await policy.project(project_id)
        if payload.teamIds and project["team_id"] not in payload.teamIds:
            raise ApiError(
                400, "Project bindings must belong to an allowed team.", "Bad Request"
            )


async def create(
    db: AsyncSession, workspace_id: str, user: dict, payload: ConnectionInput
) -> dict:
    await workspace_role(db, workspace_id, user["id"])
    await _validate_grant(db, workspace_id, user, payload)
    token, now = f"flowie_mcp_{token_urlsafe(32)}", utcnow()
    result = await db.execute(
        CREATE_INSERT_MCP_CONNECTIONS,
        {
            "id": cuid(),
            "workspace": workspace_id,
            "user": user["id"],
            "name": payload.name.strip(),
            "prefix": token[:18],
            "hash": hash_token(token),
            "scopes": payload.scopes,
            "teams": payload.teamIds,
            "projects": payload.projectIds,
            "expires": now + timedelta(days=payload.expiresInDays),
            "now": now,
        },
    )
    row = result.mappings().one()
    await db.execute(
        CREATE_INSERT_AUDIT_LOGS,
        {
            "id": cuid(),
            "workspace": workspace_id,
            "user": user["id"],
            "connection": row["id"],
            "now": now,
        },
    )
    await db.commit()
    return {**present(row), "ownedByCurrentUser": True, "token": token}


async def update(
    db: AsyncSession,
    workspace_id: str,
    user: dict,
    connection_id: str,
    payload: ConnectionUpdateInput,
) -> dict:
    # Only the owner may edit: the token acts with the owner's access, so a manager
    # granting their own teams or projects would widen what the owner's client reaches.
    # The token and expiry stay unchanged; the next MCP call reads the new grant.
    # VI: Chỉ chủ kết nối được sửa: token hoạt động bằng quyền của chủ, nên quản trị
    # VI: viên cấp team/dự án của mình sẽ mở rộng phạm vi client của chủ. Token và
    # VI: hạn dùng giữ nguyên; lần gọi MCP kế tiếp đọc quyền mới.
    await workspace_role(db, workspace_id, user["id"])
    current = (
        (
            await db.execute(
                UPDATE_SELECT_MCP_CONNECTIONS,
                {
                    "id": connection_id,
                    "workspace": workspace_id,
                    "user": user["id"],
                    "now": utcnow(),
                },
            )
        )
        .mappings()
        .first()
    )
    if not current:
        raise ApiError(404, "Active connection not found.", "Not Found")
    await _validate_grant(db, workspace_id, user, payload)
    row = (
        (
            await db.execute(
                UPDATE_UPDATE_MCP_CONNECTIONS,
                {
                    "id": connection_id,
                    "name": payload.name.strip(),
                    "scopes": payload.scopes,
                    "teams": payload.teamIds,
                    "projects": payload.projectIds,
                },
            )
        )
        .mappings()
        .one()
    )
    changes = {
        key: {"from": sorted(current[column]), "to": getattr(payload, key)}
        for key, column in (
            ("scopes", "scopes"),
            ("teamIds", "team_ids"),
            ("projectIds", "project_ids"),
        )
        if sorted(current[column]) != getattr(payload, key)
    }
    await db.execute(
        UPDATE_INSERT_AUDIT_LOGS,
        {
            "id": cuid(),
            "workspace": workspace_id,
            "user": user["id"],
            "connection": connection_id,
            "metadata": json.dumps({"connectionId": connection_id, **changes}),
            "now": utcnow(),
        },
    )
    await db.commit()
    return {**present(row), "ownedByCurrentUser": True}


async def list_connections(
    db: AsyncSession, workspace_id: str, user: dict
) -> list[dict]:
    role = await workspace_role(db, workspace_id, user["id"])
    rows = await db.execute(
        LIST_CONNECTIONS_SELECT_MCP_CONNECTIONS,
        {
            "workspace": workspace_id,
            "user": user["id"],
            "manager": role in {"OWNER", "ADMIN"},
        },
    )
    return [
        {**present(row), "ownedByCurrentUser": row["user_id"] == user["id"]}
        for row in rows.mappings()
    ]


async def revoke(
    db: AsyncSession, workspace_id: str, user: dict, connection_id: str
) -> None:
    role = await workspace_role(db, workspace_id, user["id"])
    result = await db.execute(
        REVOKE_UPDATE_MCP_CONNECTIONS,
        {
            "id": connection_id,
            "workspace": workspace_id,
            "user": user["id"],
            "manager": role in {"OWNER", "ADMIN"},
            "now": utcnow(),
        },
    )
    if not result.first():
        raise ApiError(404, "Connection not found.", "Not Found")
    await db.execute(
        REVOKE_INSERT_AUDIT_LOGS,
        {
            "id": cuid(),
            "workspace": workspace_id,
            "user": user["id"],
            "connection": connection_id,
            "now": utcnow(),
        },
    )
    await db.commit()
