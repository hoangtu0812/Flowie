import json

from sqlalchemy import text

from ...core.audit_context import audit_source
from ...core.clock import utcnow
from ...core.identifiers import cuid


async def record_change(db, workspace, actor, action, entity, identifier, *, fields=()):
    await db.execute(
        text("""INSERT INTO audit_logs(id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:id,:workspace,:actor,:action,:entity,:identifier,CAST(:metadata AS jsonb),:now)"""),
        {
            "id": cuid(),
            "workspace": workspace,
            "actor": actor,
            "action": action,
            "entity": entity,
            "identifier": identifier,
            "metadata": json.dumps(
                {"source": audit_source.get(), "fields": list(fields)}
            ),
            "now": utcnow(),
        },
    )
