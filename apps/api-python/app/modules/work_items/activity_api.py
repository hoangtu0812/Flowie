from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ...domains.auth import current_user

router = APIRouter(prefix='/api/v1/_native/activities', tags=['native-activities'])
public_router = APIRouter(prefix='/api/v1/activities', tags=['activities'])


@router.get('')
@public_router.get('')
async def list_activities(
    workspaceId: str = Query(min_length=1), issueId: str | None = None, projectId: str | None = None,
    user: Any = Depends(current_user), db: AsyncSession = Depends(get_session), *,
    # The bare `Request` annotation keeps FastAPI's request injection as it was; the None default only serves
    # direct calls outside a request, which fall back to settings from the environment.
    # VI: Annotation `Request` thuần giữ nguyên cách FastAPI inject request; default None chỉ dành cho lời gọi
    # VI: trực tiếp ngoài request, khi đó settings lấy từ biến môi trường.
    request: Request = None,  # type: ignore[assignment]
    limit: Annotated[int, Query(ge=1,le=100)] = 50,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
) -> dict:
    from ...core.config import Settings
    from .collaboration_feed import activity_page
    settings = request.app.state.settings if request else Settings.from_environment()
    return await activity_page(db,workspaceId,user['id'],settings.auth_jwt_secret,
        issue_id=issueId,project_id=projectId,limit=limit,cursor=cursor)
