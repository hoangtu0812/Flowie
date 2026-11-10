
from ...core.clock import utcnow
from ...core.identifiers import cuid
from .commands import (
    MANAGEMENT_AUDIT_INSERT_AUDIT_LOGS,
)


async def management_audit(db, workspace, actor, action, identifier):
    await db.execute(
        MANAGEMENT_AUDIT_INSERT_AUDIT_LOGS,
        {
            "id": cuid(),
            "workspace": workspace,
            "actor": actor,
            "action": f"mcp.{action}",
            "entity": identifier,
            "now": utcnow(),
        },
    )
