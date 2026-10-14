from __future__ import annotations

from datetime import timedelta
from secrets import token_urlsafe

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from ...core.identifiers import _cuid, _hash_token
from ...core.clock import _utcnow
from ..access.membership import _workspace_role
from .contracts import ConnectionInput
from .domain import Principal


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
                text("""SELECT c.*,u.name AS user_name,u.email,u.avatar_url
        FROM mcp_connections c JOIN users u ON u.id=c.user_id
        JOIN workspace_members wm ON wm.user_id=c.user_id AND wm.workspace_id=c.workspace_id
        WHERE c.id=:id AND c.revoked_at IS NULL AND c.expires_at>:now AND u.status='ACTIVE' AND wm.status='ACTIVE' """),
                {"id": connection_id, "now": _utcnow()},
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
    )


async def authenticate(db: AsyncSession, token: str) -> Principal:
    if not token.startswith("flowie_mcp_") or len(token) > 128:
        raise ApiError(401, "Invalid MCP token.", "Unauthorized")
    result = await db.execute(
        text("""
        SELECT c.*,u.name AS user_name,u.email,u.avatar_url
        FROM mcp_connections c JOIN users u ON u.id=c.user_id
        JOIN workspace_members wm ON wm.workspace_id=c.workspace_id AND wm.user_id=c.user_id
        WHERE c.token_hash=:hash AND c.revoked_at IS NULL AND c.expires_at>:now
        AND u.status='ACTIVE' AND wm.status='ACTIVE'
    """),
        {"hash": _hash_token(token), "now": _utcnow()},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(
            401, "The MCP token is invalid, expired or revoked.", "Unauthorized"
        )
    await db.execute(
        text("UPDATE mcp_connections SET last_used_at=:now WHERE id=:id"),
        {"id": row["id"], "now": _utcnow()},
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
    )


async def validate_current(db: AsyncSession, principal: Principal) -> None:
    # The shared lock prevents a concurrent revocation from completing during a mutation.
    row = (
        await db.execute(
            text("""
        SELECT c.id FROM mcp_connections c JOIN users u ON u.id=c.user_id
        JOIN workspace_members wm ON wm.user_id=c.user_id AND wm.workspace_id=c.workspace_id
        WHERE c.id=:id AND c.revoked_at IS NULL AND c.expires_at>:now
        AND u.status='ACTIVE' AND wm.status='ACTIVE' FOR SHARE OF c,u,wm
    """),
            {"id": principal.connection_id, "now": _utcnow()},
        )
    ).first()
    if not row:
        raise ApiError(401, "The MCP connection is no longer active.", "Unauthorized")


async def create(
    db: AsyncSession, workspace_id: str, user: dict, payload: ConnectionInput
) -> dict:
    await _workspace_role(db, workspace_id, user["id"])
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
    token, now = f"flowie_mcp_{token_urlsafe(32)}", _utcnow()
    result = await db.execute(
        text("""
        INSERT INTO mcp_connections (id,workspace_id,user_id,name,prefix,token_hash,scopes,team_ids,project_ids,expires_at,created_at)
        VALUES (:id,:workspace,:user,:name,:prefix,:hash,:scopes,:teams,:projects,:expires,:now) RETURNING *
    """),
        {
            "id": _cuid(),
            "workspace": workspace_id,
            "user": user["id"],
            "name": payload.name.strip(),
            "prefix": token[:18],
            "hash": _hash_token(token),
            "scopes": payload.scopes,
            "teams": payload.teamIds,
            "projects": payload.projectIds,
            "expires": now + timedelta(days=payload.expiresInDays),
            "now": now,
        },
    )
    row = result.mappings().one()
    await db.execute(
        text("""INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:id,:workspace,:user,'mcp.connection.created','mcp-connection',:connection,'{}'::jsonb,:now)"""),
        {
            "id": _cuid(),
            "workspace": workspace_id,
            "user": user["id"],
            "connection": row["id"],
            "now": now,
        },
    )
    await db.commit()
    return {**present(row), "ownedByCurrentUser": True, "token": token}


async def list_connections(
    db: AsyncSession, workspace_id: str, user: dict
) -> list[dict]:
    role = await _workspace_role(db, workspace_id, user["id"])
    rows = await db.execute(
        text("""SELECT * FROM mcp_connections WHERE workspace_id=:workspace
        AND (:manager OR user_id=:user) ORDER BY created_at DESC LIMIT 200"""),
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
    role = await _workspace_role(db, workspace_id, user["id"])
    result = await db.execute(
        text("""UPDATE mcp_connections SET revoked_at=:now
        WHERE id=:id AND workspace_id=:workspace AND (:manager OR user_id=:user) RETURNING id"""),
        {
            "id": connection_id,
            "workspace": workspace_id,
            "user": user["id"],
            "manager": role in {"OWNER", "ADMIN"},
            "now": _utcnow(),
        },
    )
    if not result.first():
        raise ApiError(404, "Connection not found.", "Not Found")
    await db.execute(
        text("""INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:id,:workspace,:user,'mcp.connection.revoked','mcp-connection',:connection,'{}'::jsonb,:now)"""),
        {
            "id": _cuid(),
            "workspace": workspace_id,
            "user": user["id"],
            "connection": connection_id,
            "now": _utcnow(),
        },
    )
    await db.commit()
