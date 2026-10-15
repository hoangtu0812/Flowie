from datetime import datetime

from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...domains.auth import current_user
from .workflow_statuses import CreateStatus, EditStatus, statuses, mutate_status

router = UtcAPIRouter(prefix='/api/v1/issue-statuses', tags=['workflow'])


@router.get('')
async def read(workspaceId: str, user=Depends(current_user), db: AsyncSession=Depends(get_session)):
    return {'data':await statuses(db,workspaceId,user)}


@router.post('')
async def create(payload: CreateStatus, user=Depends(current_user), db: AsyncSession=Depends(get_session)):
    identifier = await mutate_status(db,payload.workspaceId,user,payload.model_dump(exclude={'workspaceId'}))
    await db.commit()
    return {'data':{'id':identifier}}


@router.patch('/{identifier}')
async def update(identifier: str,payload: EditStatus,workspaceId: str=Query(min_length=1),user=Depends(current_user),db: AsyncSession=Depends(get_session)):
    await mutate_status(db,workspaceId,user,payload.model_dump(exclude={'expectedUpdatedAt'}),identifier=identifier,expected=payload.expectedUpdatedAt)
    await db.commit()
    return {'data':{'id':identifier}}


@router.delete('/{identifier}')
async def delete(identifier: str,workspaceId: str,expectedUpdatedAt: datetime,user=Depends(current_user),db: AsyncSession=Depends(get_session)):
    await mutate_status(db,workspaceId,user,identifier=identifier,expected=expectedUpdatedAt,remove=True)
    await db.commit()
    return {'data':{'id':identifier}}
