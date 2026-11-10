from __future__ import annotations

import json

from fastapi import Depends, Query
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..access.membership import manager, workspace_role
from ..identity.auth import current_user
from ..mcp.domain import Principal
from ..mcp.policy import AccessPolicy
from .audit import management_audit
from .contracts import RepositoryInput

# Only the project repository settings remain here. Agent runs and label
# automations were removed with the desktop companion (DTD-544); the URL prefix
# and the audit entity type keep their old names so existing links and audit
# rows still resolve.
# VI: Ở đây chỉ còn cấu hình repository của project. Agent run và luật giao việc
# VI: theo nhãn đã bị gỡ cùng desktop companion (DTD-544); tiền tố URL và kiểu
# VI: entity audit giữ tên cũ để liên kết và dòng audit hiện có vẫn tra được.
router = APIRouter(prefix="/api/v1/agent-runs", tags=["agent-run-management"])


async def manager_policy(db, workspace, user):
    await manager(db, workspace, user["id"])
    return AccessPolicy(db, Principal("", workspace, user, frozenset(), (), ()))


@router.post("/repositories", status_code=201)
async def configure_repository(
    payload: RepositoryInput,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    policy = await manager_policy(db, workspaceId, user)
    await policy.project(payload.projectId)
    row = (
        await db.execute(
            text("""INSERT INTO project_repositories (id,workspace_id,project_id,name,repository_url,base_branch,test_commands,instructions)
        VALUES (:id,:workspace,:project,:name,:url,:branch,CAST(:commands AS jsonb),:instructions)
        ON CONFLICT (project_id,repository_url) DO UPDATE SET name=EXCLUDED.name,base_branch=EXCLUDED.base_branch,
            test_commands=EXCLUDED.test_commands,instructions=EXCLUDED.instructions RETURNING id"""),
            {
                "id": cuid(),
                "workspace": workspaceId,
                "project": payload.projectId,
                "name": payload.name,
                "url": payload.repositoryUrl,
                "branch": payload.baseBranch,
                "commands": json.dumps(payload.testCommands),
                "instructions": payload.instructions,
            },
        )
    ).scalar_one()
    await management_audit(db, workspaceId, user["id"], "repository.configured", row)
    await db.commit()
    return {"data": {"id": row}}


@router.get("/repositories")
async def list_repositories(
    workspaceId: str = Query(min_length=1),
    projectId: str | None = Query(default=None, min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    # Without projectId the list covers every project the caller can read, so Settings
    # can show each project's repositories in one request.
    # VI: Khi không có projectId, danh sách gồm mọi dự án người gọi đọc được, để Settings
    # VI: hiển thị repository của từng dự án trong một lần gọi.
    await workspace_role(db, workspaceId, user["id"])
    policy = AccessPolicy(db, Principal("", workspaceId, user, frozenset(), (), ()))
    if projectId:
        await policy.project(projectId)
    rows = (
        await db.execute(
            text(f"""SELECT r.id,r.project_id AS "projectId",r.name,r.repository_url AS "repositoryUrl",
        r.base_branch AS "baseBranch",r.test_commands AS "testCommands",r.instructions
        FROM project_repositories r JOIN projects p ON p.id=r.project_id
        WHERE r.workspace_id=:workspace AND (CAST(:project AS text) IS NULL OR r.project_id=:project)
        AND p.archived_at IS NULL AND {policy.team_clause("p.team_id", shared=True)}
        ORDER BY r.project_id,r.name,r.id LIMIT 500"""),
            {**policy.params, "project": projectId},
        )
    ).mappings()
    return {"data": [dict(row) for row in rows]}


@router.put("/repositories/{repository_id}")
async def update_repository(
    repository_id: str,
    payload: RepositoryInput,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    # Updates one repository by id, so its URL can change; a repository stays in its project.
    # VI: Cập nhật một repository theo id để đổi được URL; repository vẫn thuộc dự án cũ.
    policy = await manager_policy(db, workspaceId, user)
    await policy.project(payload.projectId)
    try:
        row = (
            await db.execute(
                text("""UPDATE project_repositories SET name=:name,repository_url=:url,base_branch=:branch,
            test_commands=CAST(:commands AS jsonb),instructions=:instructions
            WHERE id=:id AND workspace_id=:workspace AND project_id=:project RETURNING id"""),
                {
                    "id": repository_id,
                    "workspace": workspaceId,
                    "project": payload.projectId,
                    "name": payload.name,
                    "url": payload.repositoryUrl,
                    "branch": payload.baseBranch,
                    "commands": json.dumps(payload.testCommands),
                    "instructions": payload.instructions,
                },
            )
        ).first()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(
            409, "This project already has a repository with that URL.", "Conflict"
        ) from error
    if not row:
        raise ApiError(404, "Repository not found.", "Not Found")
    await management_audit(
        db, workspaceId, user["id"], "repository.updated", repository_id
    )
    await db.commit()
    return {"data": {"id": repository_id}}


@router.delete("/repositories/{repository_id}")
async def remove_repository(
    repository_id: str,
    workspaceId: str = Query(min_length=1),
    user=Depends(current_user),
    db=Depends(get_session),
):
    policy = await manager_policy(db, workspaceId, user)
    target = (
        await db.execute(
            text(
                "SELECT project_id FROM project_repositories WHERE id=:id AND workspace_id=:workspace"
            ),
            {"id": repository_id, "workspace": workspaceId},
        )
    ).first()
    if not target:
        raise ApiError(404, "Repository not found.", "Not Found")
    await policy.project(target[0])
    await db.execute(
        text("DELETE FROM project_repositories WHERE id=:id"), {"id": repository_id}
    )
    await management_audit(
        db, workspaceId, user["id"], "repository.removed", repository_id
    )
    await db.commit()
    return {"data": {"id": repository_id, "removed": True}}
