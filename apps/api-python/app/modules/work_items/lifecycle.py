from sqlalchemy import text

from ...core.audit_context import audit_source


async def actor_context(db, actor, *, source=None):
    source = source or db.info.get("lifecycle_source") or audit_source.get()
    await db.execute(
        text(
            "SELECT set_config('flowie.actor_id',:actor,true),set_config('flowie.audit_source',:source,true)"
        ),
        {"actor": actor, "source": source},
    )


async def managed_due(db, issue, deadline):
    previous = (
        await db.execute(text("SELECT current_setting('flowie.sla_managed_due',true)"))
    ).scalar_one_or_none() or ""
    await db.execute(text("SELECT set_config('flowie.sla_managed_due','true',true)"))
    await db.execute(
        text("UPDATE issues SET due_date=:due WHERE id=:id"),
        {"id": issue, "due": deadline},
    )
    # A failed statement rolls its local context back with the owning transaction/savepoint.
    await db.execute(
        text("SELECT set_config('flowie.sla_managed_due',:previous,true)"),
        {"previous": previous},
    )
