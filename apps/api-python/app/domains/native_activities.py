from __future__ import annotations

from typing import Any, Annotated

from fastapi import Depends, Query, Request
from ..core.utc_responses import UtcAPIRouter as APIRouter
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_session
from .auth import current_user


router = APIRouter(prefix='/api/v1/_native/activities', tags=['native-activities'])
public_router = APIRouter(prefix='/api/v1/activities', tags=['activities'])


@router.get('')
@public_router.get('')
async def list_activities(
    workspaceId: str = Query(min_length=1), issueId: str | None = None, projectId: str | None = None,
    user: Any = Depends(current_user), db: AsyncSession = Depends(get_session), *,
    request: Request = None,
    limit: Annotated[int, Query(ge=1,le=100)] = 50,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
) -> dict:
    from ..modules.work_items.collaboration_feed import activity_page
    from ..core.config import Settings
    settings = request.app.state.settings if request else Settings.from_environment()
    return await activity_page(db,workspaceId,user['id'],settings.auth_jwt_secret,
        issue_id=issueId,project_id=projectId,limit=limit,cursor=cursor)
