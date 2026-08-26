from __future__ import annotations
from typing import Any
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ..db.session import get_session
from .auth import current_user
from .native_projects import _workspace_access

router=APIRouter(prefix='/api/v1/pulse',tags=['pulse'])
LABELS={'issue.created':'created an issue','issue.updated':'updated an issue','issue.archived':'archived an issue','issue.moved':'moved an issue','project.created':'created a project','project.updated':'updated a project','project.archived':'archived a project'}

@router.get('')
async def pulse(workspaceId:str=Query(min_length=1),limit:int=Query(default=100,ge=1,le=200),user:Any=Depends(current_user),db:AsyncSession=Depends(get_session)):
    await _workspace_access(db,workspaceId,user['id'])
    activities=await db.execute(text('''SELECT a.*,u.name actor_name,u.avatar_url actor_avatar,i.id issue_id,i.identifier issue_identifier,i.title issue_title,p.id project_id,p.name project_name
    FROM activities a LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN issues i ON i.id=a.issue_id LEFT JOIN projects p ON p.id=a.project_id
    WHERE a.workspace_id=:workspace_id AND (i.id IS NULL OR (i.archived_at IS NULL AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=i.team_id AND tm.user_id=:user_id)))
    AND (p.id IS NULL OR (p.archived_at IS NULL AND (p.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=p.team_id AND tm.user_id=:user_id)))) ORDER BY a.created_at DESC LIMIT :limit'''),{'workspace_id':workspaceId,'user_id':user['id'],'limit':limit})
    updates=await db.execute(text('''SELECT pu.*,u.name actor_name,u.avatar_url actor_avatar,p.id project_id,p.name project_name FROM project_updates pu JOIN users u ON u.id=pu.author_id JOIN projects p ON p.id=pu.project_id
    WHERE pu.workspace_id=:workspace_id AND p.archived_at IS NULL AND (p.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=p.team_id AND tm.user_id=:user_id)) ORDER BY pu.created_at DESC LIMIT :limit'''),{'workspace_id':workspaceId,'user_id':user['id'],'limit':limit})
    items=[]
    for r in activities.mappings().all():
        entity={'type':'issue','id':r['issue_id'],'label':f"{r['issue_identifier']} · {r['issue_title']}"} if r['issue_id'] else ({'type':'project','id':r['project_id'],'label':r['project_name']} if r['project_id'] else None)
        items.append({'id':f"activity:{r['id']}",'kind':'activity','title':f"{r['actor_name'] or 'System'} {LABELS.get(r['type'],str(r['type']).replace('.',' '))}",'body':None,'health':None,'createdAt':r['created_at'],'actor':{'id':r['actor_id'],'name':r['actor_name'],'avatarUrl':r['actor_avatar']} if r['actor_id'] else None,'entity':entity})
    for r in updates.mappings().all(): items.append({'id':f"project-update:{r['id']}",'kind':'project-update','title':f"{r['actor_name']} posted an update",'body':r['body'],'health':r['health'],'createdAt':r['created_at'],'actor':{'id':r['author_id'],'name':r['actor_name'],'avatarUrl':r['actor_avatar']},'entity':{'type':'project','id':r['project_id'],'label':r['project_name']}})
    return {'data':sorted(items,key=lambda x:x['createdAt'],reverse=True)[:limit]}
