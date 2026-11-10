
from ....core.clock import utcnow
from ....core.errors import ApiError
from ...audit.write import record_change
from .commands import (
    REVOKE_CREDENTIAL_UPDATE_MCP_CONNECTIONS,
    REVOKE_CREDENTIAL_UPDATE_PERSONAL_API_KEYS,
)
from .events import record_event
from .sessions import active_identity, expired, lock_account


async def revoke_credential(db, user, request, kind, identifier):
    await lock_account(db, user["id"])
    if (
        await active_identity(
            db,
            {"sub": user["id"], "sid": user["session_id"], "ver": user["auth_version"]},
        )
        is None
    ):
        raise expired()
    if kind == "MCP":
        workspace = (
            await db.execute(
                REVOKE_CREDENTIAL_UPDATE_MCP_CONNECTIONS,
                {"id": identifier, "user": user["id"], "now": utcnow()},
            )
        ).scalar_one_or_none()
        if workspace is None:
            raise ApiError(404, "Credential not found.", "Not Found")
        await record_change(
            db,
            workspace,
            user["id"],
            "mcp.connection.revoked",
            "mcp-connection",
            identifier,
        )
    elif kind == "LEGACY_API_KEY":
        row = (
            await db.execute(
                REVOKE_CREDENTIAL_UPDATE_PERSONAL_API_KEYS,
                {"id": identifier, "user": user["id"], "now": utcnow()},
            )
        ).scalar_one_or_none()
        if row is None:
            raise ApiError(404, "Credential not found.", "Not Found")
    else:
        raise ApiError(400, "Unsupported credential type.", "Bad Request")
    await record_event(db, user["id"], "CREDENTIAL_REVOKED", kind, request)
