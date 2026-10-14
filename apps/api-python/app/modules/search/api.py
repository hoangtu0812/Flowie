from typing import Annotated, Literal
from fastapi import Depends, Query, Request
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...domains.auth import current_user
from .service import search

router = UtcAPIRouter(prefix="/api/v1/search", tags=["workspace-search"])


@router.get("")
async def search_workspace(
    request: Request,
    workspaceId: Annotated[str, Query(min_length=1)],
    query: Annotated[str, Query(min_length=1, max_length=200)],
    kind: Literal["issue", "document", "project", "member"] | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return await search(
        db,
        workspaceId,
        user["id"],
        request.app.state.settings.auth_jwt_secret,
        query,
        kind=kind,
        limit=limit,
        cursor=cursor,
    )
