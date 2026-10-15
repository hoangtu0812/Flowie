from datetime import timedelta

from sqlalchemy import text

from ....core.clock import _utcnow
from ....core.pagination import CursorCodec


async def read_page(
    db, user, secret, operation, select, params, *, filters=None, cursor=None, limit=50
):
    codec = CursorCodec(secret, user["id"], operation, filters or {})
    total = (
        await db.execute(text("SELECT COUNT(*) FROM (" + select + ") items"), params)
    ).scalar_one()
    clause = ""
    if cursor:
        params["after"], params["after_id"] = codec.decode(cursor)
        clause = " WHERE (created_at,id)<(:after,:after_id)"
    rows = (
        (
            await db.execute(
                text(
                    "SELECT * FROM ("
                    + select
                    + ") items"
                    + clause
                    + " ORDER BY created_at DESC,id DESC LIMIT :limit"
                ),
                {**params, "limit": limit + 1},
            )
        )
        .mappings()
        .all()
    )
    return rows[:limit], {
        "total": total,
        "limit": limit,
        "nextCursor": codec.encode(rows[limit - 1]["created_at"], rows[limit - 1]["id"])
        if len(rows) > limit
        else None,
    }


async def session_page(db, user, secret, **page):
    rows, meta = await read_page(
        db,
        user,
        secret,
        "account-sessions",
        "SELECT id,ip_address,user_agent,auth_method,authenticated_at,created_at,last_used_at,expires_at FROM sessions WHERE user_id=:user AND revoked_at IS NULL AND expires_at>:now",
        {"user": user["id"], "now": _utcnow()},
        **page,
    )
    return {
        "data": [
            {
                "id": row["id"],
                "current": row["id"] == user["session_id"],
                "ipAddress": row["ip_address"],
                "userAgent": row["user_agent"],
                "method": row["auth_method"],
                "authenticatedAt": row["authenticated_at"],
                "createdAt": row["created_at"],
                "lastUsedAt": row["last_used_at"],
                "expiresAt": row["expires_at"],
            }
            for row in rows
        ],
        "meta": meta,
    }


async def event_page(db, user, secret, *, kind=None, **page):
    select = "SELECT id,kind,method,ip_address,user_agent,created_at FROM account_security_events WHERE user_id=:user AND created_at>=:cutoff"
    params = {"user": user["id"], "cutoff": _utcnow() - timedelta(days=30)}
    if kind:
        select += " AND kind=:kind"
        params["kind"] = kind
    rows, meta = await read_page(
        db,
        user,
        secret,
        "account-security-history",
        select,
        params,
        filters={"kind": kind},
        **page,
    )
    return {
        "data": [
            {
                "id": row["id"],
                "kind": row["kind"],
                "method": row["method"],
                "ipAddress": row["ip_address"],
                "userAgent": row["user_agent"],
                "createdAt": row["created_at"],
            }
            for row in rows
        ],
        "meta": meta,
    }


async def credential_page(db, user, secret, *, include_revoked=False, **page):
    select = """SELECT 'MCP:'||c.id AS id,c.id AS credential_id,'MCP' AS kind,c.name,c.prefix,c.scopes,c.expires_at,c.revoked_at,c.last_used_at,c.created_at,w.name AS workspace_name,
        CASE WHEN w.id IS NOT NULL THEN c.workspace_id END AS workspace_id
        FROM mcp_connections c LEFT JOIN workspaces w ON w.id=c.workspace_id AND EXISTS(SELECT 1 FROM workspace_members wm WHERE wm.workspace_id=c.workspace_id AND wm.user_id=:user AND wm.status='ACTIVE')
        WHERE c.user_id=:user AND (:revoked OR c.revoked_at IS NULL)
        UNION ALL SELECT 'LEGACY_API_KEY:'||k.id,k.id,'LEGACY_API_KEY',k.name,k.prefix,ARRAY[]::text[],k.expires_at,k.revoked_at,k.last_used_at,k.created_at,NULL::text,NULL::text
        FROM personal_api_keys k WHERE k.user_id=:user AND (:revoked OR k.revoked_at IS NULL)"""
    rows, meta = await read_page(
        db,
        user,
        secret,
        "account-credentials",
        select,
        {"user": user["id"], "revoked": include_revoked},
        filters={"includeRevoked": include_revoked},
        **page,
    )
    return {
        "data": [
            {
                "id": row["id"],
                "credentialId": row["credential_id"],
                "kind": row["kind"],
                "name": row["name"],
                "prefix": row["prefix"],
                "scopes": row["scopes"],
                "workspaceId": row["workspace_id"],
                "workspaceName": row["workspace_name"],
                "createdAt": row["created_at"],
                "expiresAt": row["expires_at"],
                "revokedAt": row["revoked_at"],
                "lastUsedAt": row["last_used_at"],
            }
            for row in rows
        ],
        "meta": meta,
    }
