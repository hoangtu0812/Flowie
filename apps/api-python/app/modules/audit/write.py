import json

from ...core.audit_context import audit_source
from ...core.clock import utcnow
from ...core.identifiers import cuid
from .commands import (
    RECORD_CHANGE_INSERT_AUDIT_LOGS,
)


async def record_change(db, workspace, actor, action, entity, identifier, *, fields=()):
    await db.execute(
        RECORD_CHANGE_INSERT_AUDIT_LOGS,
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
