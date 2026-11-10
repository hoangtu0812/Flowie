from __future__ import annotations

from typing import Any

from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..access.projects import workspace_access
from ..identity.auth import current_user
from .queries import (
    PULSE_SELECT_ACTIVITIES,
    PULSE_SELECT_PROJECT_UPDATES,
)

router=APIRouter(prefix='/api/v1/pulse',tags=['pulse'])
LABELS={'issue.created':'created an issue','issue.updated':'updated an issue','issue.archived':'archived an issue','issue.moved':'moved an issue','project.created':'created a project','project.updated':'updated a project','project.archived':'archived a project'}

@router.get('')
async def pulse(workspaceId:str=Query(min_length=1),limit:int=Query(default=100,ge=1,le=200),user:Any=Depends(current_user),db:AsyncSession=Depends(get_session)):
    await workspace_access(db,workspaceId,user['id'])
    activities=await db.execute(PULSE_SELECT_ACTIVITIES,{'workspace_id':workspaceId,'user_id':user['id'],'limit':limit})
    updates=await db.execute(PULSE_SELECT_PROJECT_UPDATES,{'workspace_id':workspaceId,'user_id':user['id'],'limit':limit})
    items=[]
    for r in activities.mappings().all():
        entity={'type':'issue','id':r['issue_id'],'label':f"{r['issue_identifier']} · {r['issue_title']}"} if r['issue_id'] else ({'type':'project','id':r['project_id'],'label':r['project_name']} if r['project_id'] else None)
        items.append({'id':f"activity:{r['id']}",'kind':'activity','title':f"{r['actor_name'] or 'System'} {LABELS.get(r['type'],str(r['type']).replace('.',' '))}",'body':None,'health':None,'createdAt':r['created_at'],'actor':{'id':r['actor_id'],'name':r['actor_name'],'avatarUrl':r['actor_avatar']} if r['actor_id'] else None,'entity':entity})
    for r in updates.mappings().all(): items.append({'id':f"project-update:{r['id']}",'kind':'project-update','title':f"{r['actor_name']} posted an update",'body':r['body'],'health':r['health'],'createdAt':r['created_at'],'actor':{'id':r['author_id'],'name':r['actor_name'],'avatarUrl':r['actor_avatar']},'entity':{'type':'project','id':r['project_id'],'label':r['project_name']}})
    return {'data':sorted(items,key=lambda x:x['createdAt'],reverse=True)[:limit]}
