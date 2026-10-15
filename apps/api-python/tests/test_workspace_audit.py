import asyncio
from datetime import timedelta
import json
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.audit.contracts import AuditFilters
from app.modules.audit.query import audit_page


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_workspace_audit_filters_cursors_scrubbing_private_entities_and_revocation():
    asyncio.run(verify_audit())


async def verify_audit():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            owner, reader = [{"id": _cuid(), "name": "Audit test"} for _ in range(2)]
            for user in [owner, reader]:
                await db.execute(
                    text(
                        "INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"
                    ),
                    {**user, "email": _cuid() + "@example.test", "now": now},
                )
            seed = await create_workspace_bootstrap(
                db,
                user_id=owner["id"],
                organization_name="Audit",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            await db.execute(
                text(
                    "INSERT INTO workspace_members(id,workspace_id,user_id,status,role,created_at,updated_at) VALUES (:id,:workspace,:user,'ACTIVE','ADMIN',:now,:now)"
                ),
                {
                    "id": _cuid(),
                    "workspace": workspace,
                    "user": reader["id"],
                    "now": now,
                },
            )
            visible, private = _cuid(), _cuid()
            for identifier, project_team in [(visible, None), (private, team)]:
                await db.execute(
                    text(
                        "INSERT INTO projects(id,workspace_id,team_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,:team,'Audit project',:id,:now,:now)"
                    ),
                    {
                        "id": identifier,
                        "workspace": workspace,
                        "team": project_team,
                        "now": now,
                    },
                )
                await db.execute(
                    text("""INSERT INTO audit_logs(id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
                    SELECT 'c'||md5(:project||n::text),:workspace,:user,'project.saved','project',:project,CAST(:metadata AS jsonb),:now
                    FROM generate_series(1,125) n"""),
                    {
                        "project": identifier,
                        "workspace": workspace,
                        "user": owner["id"],
                        "now": now,
                        "metadata": json.dumps(
                            {
                                "source": "WEB",
                                "secret": "never-return",
                                "fields": ["name"],
                                "before": "private text",
                            }
                        ),
                    },
                )
            filters = AuditFilters(
                source="WEB",
                actorId=owner["id"],
                entityType="project",
                since=now - timedelta(minutes=1),
            )
            first = await audit_page(
                db, workspace, reader["id"], "audit-secret", filters
            )
            assert first["meta"]["total"] == 125 and len(first["data"]) == 50
            assert all(
                row["entityId"] == visible and row["metadata"] == {"fields": ["name"]}
                for row in first["data"]
            )
            cursor = first["meta"]["nextCursor"]
            seen = {row["id"] for row in first["data"]}
            while cursor:
                page = await audit_page(
                    db, workspace, reader["id"], "audit-secret", filters, cursor=cursor
                )
                ids = {row["id"] for row in page["data"]}
                assert not seen & ids
                seen |= ids
                cursor = page["meta"]["nextCursor"]
            assert len(seen) == 125
            with pytest.raises(ApiError):
                await audit_page(
                    db,
                    workspace,
                    owner["id"],
                    "audit-secret",
                    filters,
                    cursor=first["meta"]["nextCursor"],
                )
            with pytest.raises(ApiError):
                await audit_page(
                    db,
                    workspace,
                    reader["id"],
                    "audit-secret",
                    AuditFilters(source="AI"),
                    cursor=first["meta"]["nextCursor"],
                )
            exported = await audit_page(
                db, workspace, reader["id"], "audit-secret", filters, export=True
            )
            assert len(exported["data"]) == 125
            await db.execute(
                text("UPDATE projects SET archived_at=:now WHERE id=:id"),
                {"id": visible, "now": now},
            )
            assert (
                await audit_page(db, workspace, reader["id"], "audit-secret", filters)
            )["meta"]["total"] == 125
            for entity, entity_id, metadata, actor, expected in [
                (
                    "mcp-tool",
                    visible,
                    {"tool": "flowie.projects.get", "secret": "hidden"},
                    owner["id"],
                    "AI",
                ),
                ("project", visible, {}, owner["id"], "UNKNOWN"),
                ("project", visible, {}, None, "SYSTEM"),
                (
                    "issue-status",
                    _cuid(),
                    {"source": "WEB", "scope": "WORKSPACE"},
                    owner["id"],
                    "WEB",
                ),
                (
                    "issue-status",
                    _cuid(),
                    {"source": "WEB", "scope": "TEAM", "teamId": team},
                    owner["id"],
                    None,
                ),
                ("unresolved-type", visible, {"source": "WEB"}, owner["id"], None),
                ("mcp-tool", private, {"source": "AI"}, owner["id"], None),
            ]:
                identifier = _cuid()
                await db.execute(
                    text("""INSERT INTO audit_logs(id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
                    VALUES (:id,:workspace,:actor,'audit.acceptance',:entity,:entity_id,CAST(:metadata AS jsonb),:now)"""),
                    {
                        "id": identifier,
                        "workspace": workspace,
                        "actor": actor,
                        "entity": entity,
                        "entity_id": entity_id,
                        "metadata": json.dumps(metadata),
                        "now": now,
                    },
                )
                events = await audit_page(
                    db,
                    workspace,
                    reader["id"],
                    "audit-secret",
                    AuditFilters(entityType=entity),
                    export=True,
                )
                matching = [
                    row for row in events["data"] if row["id"] == "audit:" + identifier
                ]
                assert bool(matching) == bool(expected)
                if expected:
                    assert matching[0]["source"] == expected
                    assert "secret" not in matching[0]["metadata"]
            await db.execute(
                text(
                    "INSERT INTO team_members(team_id,user_id,created_at) VALUES (:team,:user,:now)"
                ),
                {"team": team, "user": reader["id"], "now": now},
            )
            assert (
                await audit_page(db, workspace, reader["id"], "audit-secret", filters)
            )["meta"]["total"] == 250
            await db.execute(
                text("DELETE FROM team_members WHERE team_id=:team AND user_id=:user"),
                {"team": team, "user": reader["id"]},
            )
            assert (
                await audit_page(db, workspace, reader["id"], "audit-secret", filters)
            )["meta"]["total"] == 125
            await db.execute(
                text(
                    "UPDATE workspace_members SET role='MEMBER' WHERE workspace_id=:workspace AND user_id=:user"
                ),
                {"workspace": workspace, "user": reader["id"]},
            )
            with pytest.raises(ApiError) as denied:
                await audit_page(db, workspace, reader["id"], "audit-secret", filters)
            assert denied.value.status_code == 403
            await db.rollback()
    finally:
        await engine.dispose()
