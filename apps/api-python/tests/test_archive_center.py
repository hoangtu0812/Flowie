import asyncio
from datetime import timedelta
import os

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _utcnow, create_workspace_bootstrap
from app.modules.archive.repository import archive_page
from app.modules.archive.service import restore_preview, restore, archive_project


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_archive_scope_restore_dependencies_conflicts_and_cascade_authorization():
    asyncio.run(verify_archive())


async def verify_archive():
    engine = create_async_engine(
        _async_database_url(os.environ["MCP_TEST_DATABASE_URL"])
    )
    try:
        async with async_sessionmaker(engine)() as db:
            now = _utcnow()
            owner, reader = [{"id": _cuid(), "name": "Archive test"} for _ in range(2)]
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
                organization_name="Archive test",
                workspace_name=_cuid(),
                now=now,
            )
            workspace, team = seed["workspace_id"], seed["team_id"]
            await db.execute(
                text(
                    "INSERT INTO workspace_members(id,workspace_id,user_id,status,role,created_at,updated_at) VALUES (:id,:workspace,:user,'ACTIVE','MEMBER',:now,:now)"
                ),
                {
                    "id": _cuid(),
                    "workspace": workspace,
                    "user": reader["id"],
                    "now": now,
                },
            )
            project, issue, doc, initiative = [_cuid() for _ in range(4)]
            await db.execute(
                text(
                    "INSERT INTO projects(id,workspace_id,name,identifier,created_at,updated_at) VALUES (:id,:workspace,'Shared archive test','ARCH',:now,:now)"
                ),
                {"id": project, "workspace": workspace, "now": now},
            )
            status = (
                await db.execute(
                    text(
                        "SELECT id FROM issue_statuses WHERE workspace_id=:workspace LIMIT 1"
                    ),
                    {"workspace": workspace},
                )
            ).scalar_one()
            await db.execute(
                text(
                    "INSERT INTO issues(id,workspace_id,team_id,project_id,status_id,identifier,number,title,creator_id,created_at,updated_at) VALUES (:id,:workspace,:team,:project,:status,'ARCH-1',1,'Private issue',:user,:now,:now)"
                ),
                {
                    "id": issue,
                    "workspace": workspace,
                    "team": team,
                    "project": project,
                    "status": status,
                    "user": owner["id"],
                    "now": now,
                },
            )
            with pytest.raises(ApiError) as forbidden:
                await archive_project(db, workspace, reader, project)
            assert forbidden.value.status_code == 403
            assert (
                await db.execute(
                    text("SELECT archived_at FROM issues WHERE id=:id"), {"id": issue}
                )
            ).scalar_one() is None
            await archive_project(db, workspace, owner, project)
            assert (
                await archive_page(
                    db, workspace, reader["id"], "issue", "archive-secret"
                )
            )["data"] == []
            assert (
                len(
                    (
                        await archive_page(
                            db, workspace, reader["id"], "project", "archive-secret"
                        )
                    )["data"]
                )
                == 1
            )
            with pytest.raises(ApiError):
                await restore_preview(db, workspace, reader, "issue", issue)
            blocked = await restore_preview(db, workspace, owner, "issue", issue)
            assert not blocked["canRestore"] and blocked["blockers"] == [
                "Restore the project first."
            ]
            preview = await restore_preview(db, workspace, reader, "project", project)
            assert preview['relatedArchivedIssues']==0
            assert (await restore_preview(db,workspace,owner,'project',project))['relatedArchivedIssues']==1
            with pytest.raises(ApiError) as conflict:
                await restore(
                    db,
                    workspace,
                    reader,
                    "project",
                    project,
                    preview["updatedAt"] - timedelta(seconds=1),
                )
            assert conflict.value.status_code == 409
            await restore(
                db, workspace, reader, "project", project, preview["updatedAt"]
            )
            assert (
                await db.execute(
                    text("SELECT archived_at FROM issues WHERE id=:id"), {"id": issue}
                )
            ).scalar_one() is not None
            await db.execute(
                text("UPDATE teams SET archived_at=:now WHERE id=:id"),
                {"id": team, "now": now},
            )
            assert not (await restore_preview(db, workspace, owner, "issue", issue))[
                "canRestore"
            ]
            await db.execute(
                text("UPDATE teams SET archived_at=NULL WHERE id=:id"), {"id": team}
            )
            preview = await restore_preview(db, workspace, owner, "issue", issue)
            await restore(db, workspace, owner, "issue", issue, preview["updatedAt"])
            assert not (
                await archive_page(
                    db, workspace, owner["id"], "issue", "archive-secret"
                )
            )["data"]
            await db.execute(
                text(
                    "INSERT INTO documents(id,workspace_id,title,content,created_by,updated_by,archived_at,created_at,updated_at) VALUES (:id,:workspace,'Archived document','Keep content',:user,:user,:now,:now,:now)"
                ),
                {"id": doc, "workspace": workspace, "user": owner["id"], "now": now},
            )
            preview = await restore_preview(db, workspace, reader, "document", doc)
            await restore(db, workspace, reader, "document", doc, preview["updatedAt"])
            row = (
                (
                    await db.execute(
                        text(
                            "SELECT content,updated_by,version FROM documents WHERE id=:id"
                        ),
                        {"id": doc},
                    )
                )
                .mappings()
                .one()
            )
            assert (
                row["content"] == "Keep content"
                and row["updated_by"] == reader["id"]
                and row["version"] == 2
            )
            await db.execute(
                text(
                    "INSERT INTO initiatives(id,workspace_id,name,archived_at,created_at,updated_at) VALUES (:id,:workspace,'Archived initiative',:now,:now,:now)"
                ),
                {"id": initiative, "workspace": workspace, "now": now},
            )
            with pytest.raises(ApiError):
                await archive_page(
                    db, workspace, reader["id"], "initiative", "archive-secret"
                )
            preview = await restore_preview(
                db, workspace, owner, "initiative", initiative
            )
            await restore(
                db, workspace, owner, "initiative", initiative, preview["updatedAt"]
            )
            assert (
                await db.execute(
                    text(
                        "SELECT COUNT(*) FROM audit_logs WHERE workspace_id=:workspace AND action LIKE '%.restored'"
                    ),
                    {"workspace": workspace},
                )
            ).scalar_one() == 4
            await db.rollback()
    finally:
        await engine.dispose()
