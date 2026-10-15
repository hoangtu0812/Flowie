from typing import Annotated, Literal

from fastapi import Depends, Query, Request, Response

from ....core.utc_responses import UtcAPIRouter
from ....db.session import get_session
from ....domains.auth import current_user
from ..password_reset import limit_request
from .queries import session_page, event_page, credential_page
from .credentials import revoke_credential


async def private_response(response: Response):
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"


router = UtcAPIRouter(
    prefix="/api/v1/account-security",
    tags=["account-security"],
    dependencies=[Depends(private_response)],
)


@router.get("/sessions")
async def sessions(
    request: Request,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return await session_page(
        db, user, request.app.state.settings.auth_jwt_secret, cursor=cursor, limit=limit
    )


@router.get("/events")
async def events(
    request: Request,
    kind: Annotated[str | None, Query(max_length=50, pattern=r"^[A-Z_]+$")] = None,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return await event_page(
        db,
        user,
        request.app.state.settings.auth_jwt_secret,
        kind=kind,
        cursor=cursor,
        limit=limit,
    )


@router.get("/credentials")
async def credentials(
    request: Request,
    includeRevoked: bool = False,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    user=Depends(current_user),
    db=Depends(get_session),
):
    return await credential_page(
        db,
        user,
        request.app.state.settings.auth_jwt_secret,
        include_revoked=includeRevoked,
        cursor=cursor,
        limit=limit,
    )


@router.post("/credentials/{kind}/{identifier}/revoke")
async def revoke(
    kind: Literal["MCP", "LEGACY_API_KEY"],
    identifier: str,
    request: Request,
    user=Depends(current_user),
    db=Depends(get_session),
):
    await limit_request(
        db,
        request.app.state.settings.auth_jwt_secret,
        "credential-revoke",
        user["id"],
        60,
    )
    await revoke_credential(db, user, request, kind, identifier)
    await db.commit()
    return {"data": {"revoked": True}}
