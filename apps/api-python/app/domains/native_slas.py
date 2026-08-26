from __future__ import annotations

import json
from datetime import timedelta
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .native_projects import _workspace_access, _workspace_manager

router = APIRouter(prefix='/api/v1/slas', tags=['slas'])
Priority = Literal['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']

class SlaInput(BaseModel):
    workspaceId: str | None = None
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    teamId: str | None = None
    priority: Priority | None = None
    deadlineMinutes: int | None = Field(default=None, ge=15, le=525600)
    enabled: bool | None = None

async def resolve_deadline(db: AsyncSession, workspace_id: str, team_id: str, priority: str):
    rows = await db.execute(text('''SELECT id, deadline_minutes, team_id, priority FROM sla_policies
                                    WHERE workspace_id = :workspace_id AND archived_at IS NULL AND enabled = TRUE
                                      AND (team_id IS NULL OR team_id = :team_id) AND (priority IS NULL OR priority = :priority)
                                    ORDER BY created_at ASC'''), {'workspace_id': workspace_id, 'team_id': team_id, 'priority': priority})
    policies = rows.mappings().all()
    if not policies: return None
    policy = sorted(policies, key=lambda p: (2 if p['team_id'] == team_id else 0) + (1 if p['priority'] == priority else 0), reverse=True)[0]
    return (_utcnow() + timedelta(minutes=policy['deadline_minutes'])).isoformat()

async def _row(db, policy_id, workspace_id):
    result = await db.execute(text('''SELECT p.*, t.id team_id_value, t.name team_name, t.identifier team_identifier, t.icon team_icon,
                                      u.id creator_id, u.name creator_name, u.avatar_url creator_avatar_url FROM sla_policies p
                                      LEFT JOIN teams t ON t.id=p.team_id JOIN users u ON u.id=p.created_by
                                      WHERE p.id=:id AND p.workspace_id=:workspace_id AND p.archived_at IS NULL'''), {'id': policy_id, 'workspace_id': workspace_id})
    r=result.mappings().first()
    if not r: raise ApiError(404,'SLA policy not found.','Not Found')
    return {'id':r['id'],'workspaceId':r['workspace_id'],'name':r['name'],'description':r['description'],'teamId':r['team_id'],'priority':r['priority'],'deadlineMinutes':r['deadline_minutes'],'enabled':r['enabled'],'createdById':r['created_by'],'createdAt':r['created_at'],'updatedAt':r['updated_at'],'team':{'id':r['team_id_value'],'name':r['team_name'],'identifier':r['team_identifier'],'icon':r['team_icon']} if r['team_id_value'] else None,'createdBy':{'id':r['creator_id'],'name':r['creator_name'],'avatarUrl':r['creator_avatar_url']}}

async def _team(db, workspace_id, team_id):
    if not team_id:return
    r=await db.execute(text('SELECT 1 FROM teams WHERE id=:id AND workspace_id=:workspace_id AND archived_at IS NULL'),{'id':team_id,'workspace_id':workspace_id})
    if r.scalar_one_or_none() is None: raise ApiError(404,'SLA team not found in this workspace.','Not Found')

async def _audit(db, workspace_id,user_id,action,policy_id,metadata):
    await db.execute(text("INSERT INTO audit_logs (id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at) VALUES (:id,:workspace_id,:actor_id,:action,'sla-policy',:entity_id,CAST(:metadata AS jsonb),:now)"),{'id':_cuid(),'workspace_id':workspace_id,'actor_id':user_id,'action':action,'entity_id':policy_id,'metadata':json.dumps(metadata),'now':_utcnow()})

@router.get('')
async def list_slas(workspaceId:str=Query(min_length=1),user:Any=Depends(current_user),db:AsyncSession=Depends(get_session)):
    await _workspace_access(db,workspaceId,user['id']); rows=await db.execute(text('SELECT id FROM sla_policies WHERE workspace_id=:workspace_id AND archived_at IS NULL ORDER BY enabled DESC,updated_at DESC'),{'workspace_id':workspaceId}); return {'data':[await _row(db,r['id'],workspaceId) for r in rows.mappings().all()]}

@router.post('')
async def create_sla(payload:SlaInput,user:Any=Depends(current_user),db:AsyncSession=Depends(get_session)):
    if not payload.workspaceId or not payload.name or payload.deadlineMinutes is None: raise ApiError(400,'workspaceId, name and deadlineMinutes are required.','Bad Request')
    await _workspace_manager(db,payload.workspaceId,user['id']); await _team(db,payload.workspaceId,payload.teamId); pid,now=_cuid(),_utcnow()
    await db.execute(text('''INSERT INTO sla_policies (id,workspace_id,name,description,team_id,priority,deadline_minutes,enabled,created_by,created_at,updated_at)
    VALUES (:id,:workspace_id,:name,:description,:team_id,:priority,:deadline_minutes,:enabled,:created_by,:now,:now)'''),{'id':pid,'workspace_id':payload.workspaceId,'name':payload.name.strip(),'description':payload.description.strip() if payload.description else None,'team_id':payload.teamId,'priority':payload.priority,'deadline_minutes':payload.deadlineMinutes,'enabled':True if payload.enabled is None else payload.enabled,'created_by':user['id'],'now':now})
    await _audit(db,payload.workspaceId,user['id'],'sla-policy.created',pid,{'name':payload.name.strip(),'deadlineMinutes':payload.deadlineMinutes}); await db.commit(); return {'data':await _row(db,pid,payload.workspaceId)}

@router.patch('/{policy_id}')
async def update_sla(policy_id:str,payload:SlaInput,workspaceId:str=Query(min_length=1),user:Any=Depends(current_user),db:AsyncSession=Depends(get_session)):
    await _workspace_manager(db,workspaceId,user['id']); await _row(db,policy_id,workspaceId); values=payload.model_dump(exclude_unset=True); await _team(db,workspaceId,values.get('teamId')); cols={'name':'name','description':'description','teamId':'team_id','priority':'priority','deadlineMinutes':'deadline_minutes','enabled':'enabled'}; sets=[];params={'id':policy_id,'now':_utcnow()}
    for f,c in cols.items():
        if f in values: params[f]=values[f].strip() if f in {'name','description'} and isinstance(values[f],str) else values[f]; sets.append(f'{c}=:{f}')
    if sets: await db.execute(text(f"UPDATE sla_policies SET {','.join(sets)},updated_at=:now WHERE id=:id"),params); await _audit(db,workspaceId,user['id'],'sla-policy.updated',policy_id,values); await db.commit()
    return {'data':await _row(db,policy_id,workspaceId)}

@router.delete('/{policy_id}')
async def archive_sla(policy_id:str,workspaceId:str=Query(min_length=1),user:Any=Depends(current_user),db:AsyncSession=Depends(get_session)):
    await _workspace_manager(db,workspaceId,user['id']); p=await _row(db,policy_id,workspaceId); now=_utcnow(); await db.execute(text('UPDATE sla_policies SET archived_at=:now,updated_at=:now WHERE id=:id'),{'id':policy_id,'now':now}); await _audit(db,workspaceId,user['id'],'sla-policy.archived',policy_id,{'name':p['name']}); await db.commit(); return {'data':{'id':policy_id,'archivedAt':now}}
