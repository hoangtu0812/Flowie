
from ...core.audit_context import audit_source
from .commands import (
    ACTOR_CONTEXT_LOCK,
    MANAGED_DUE_LOCK,
    MANAGED_DUE_LOCK_2,
    MANAGED_DUE_UPDATE_ISSUES,
)
from .queries import (
    MANAGED_DUE_SELECT,
)


async def actor_context(db, actor, *, source=None):
    source = source or db.info.get("lifecycle_source") or audit_source.get()
    await db.execute(
        ACTOR_CONTEXT_LOCK,
        {"actor": actor, "source": source},
    )


async def managed_due(db, issue, deadline):
    previous = (
        await db.execute(MANAGED_DUE_SELECT)
    ).scalar_one_or_none() or ""
    await db.execute(MANAGED_DUE_LOCK)
    await db.execute(
        MANAGED_DUE_UPDATE_ISSUES,
        {"id": issue, "due": deadline},
    )
    # A failed statement rolls its local context back with the owning transaction/savepoint.
    await db.execute(
        MANAGED_DUE_LOCK_2,
        {"previous": previous},
    )
