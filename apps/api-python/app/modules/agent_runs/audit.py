from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.identifiers import _cuid


async def management_audit(db, workspace, actor, action, identifier):
    await db.execute(
        text("""INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:id,:workspace,:actor,:action,'agent-run-management',:entity,'{}'::jsonb,:now)"""),
        {
            "id": _cuid(),
            "workspace": workspace,
            "actor": actor,
            "action": f"mcp.{action}",
            "entity": identifier,
            "now": _utcnow(),
        },
    )
