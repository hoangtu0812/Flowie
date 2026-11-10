from __future__ import annotations

import json

from fastapi import Depends, Query
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
from .commands import (
    CONFIGURE_REPOSITORY_INSERT_PROJECT_REPOSITORIES,
    REMOVE_REPOSITORY_DELETE_PROJECT_REPOSITORIES,
    UPDATE_REPOSITORY_UPDATE_PROJECT_REPOSITORIES,
)
from .contracts import RepositoryInput
from .queries import (
    REMOVE_REPOSITORY_SELECT_PROJECT_REPOSITORIES,
    list_repositories_select_project_repositories_sql,
)

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
            CONFIGURE_REPOSITORY_INSERT_PROJECT_REPOSITORIES,
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
            list_repositories_select_project_repositories_sql(policy),
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
                UPDATE_REPOSITORY_UPDATE_PROJECT_REPOSITORIES,
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
            REMOVE_REPOSITORY_SELECT_PROJECT_REPOSITORIES,
            {"id": repository_id, "workspace": workspaceId},
        )
    ).first()
    if not target:
        raise ApiError(404, "Repository not found.", "Not Found")
    await policy.project(target[0])
    await db.execute(
        REMOVE_REPOSITORY_DELETE_PROJECT_REPOSITORIES, {"id": repository_id}
    )
    await management_audit(
        db, workspaceId, user["id"], "repository.removed", repository_id
    )
    await db.commit()
    return {"data": {"id": repository_id, "removed": True}}
