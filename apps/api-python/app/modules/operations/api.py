from datetime import timedelta
from typing import Literal

from fastapi import Depends, Request
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import _utcnow
from ...core.identifiers import _cuid
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ...domains.auth import current_user
from ..access.projects import _workspace_access, _workspace_manager
from ..identity.password_reset import limit_request
from .diagnostics import build_identity
from .job_query import visible_jobs

router=UtcAPIRouter(prefix='/api/v1/operations',tags=['operations'])


class ClientError(BaseModel):
    model_config=ConfigDict(extra='forbid')
    workspaceId:str=Field(min_length=1)
    category:Literal['render','unhandled','network']
    routeKind:Literal['issue','project','initiative','view','settings','inbox','other']
    digest:str|None=Field(default=None,pattern=r'^[A-Za-z0-9_-]{1,64}$')


@router.post('/client-errors')
async def client_error(payload:ClientError,request:Request,user=Depends(current_user),db:AsyncSession=Depends(get_session)):
    await _workspace_access(db,payload.workspaceId,user['id'])
    await limit_request(db,request.app.state.settings.auth_jwt_secret,'client-error',user['id'],60)
    identifier=_cuid()
    await db.execute(text('''INSERT INTO client_error_events(id,workspace_id,actor_id,category,route_kind,digest,created_at)
        VALUES (:id,:workspace,:user,:category,:route,:digest,:now)'''),{'id':identifier,'workspace':payload.workspaceId,'user':user['id'],
        'category':payload.category,'route':payload.routeKind,'digest':payload.digest,'now':_utcnow()})
    await db.commit()
    return {'data':{'reference':identifier}}


@router.get('')
async def overview(workspaceId:str,user=Depends(current_user),db:AsyncSession=Depends(get_session)):
    await _workspace_manager(db,workspaceId,user['id'])
    now=_utcnow()
    jobs,truncated=await visible_jobs(db,now)
    errors=(await db.execute(text('''SELECT category,route_kind,COUNT(*) AS count FROM client_error_events
        WHERE workspace_id=:workspace AND created_at>=:cutoff GROUP BY category,route_kind'''),{'workspace':workspaceId,'cutoff':now-timedelta(days=1)})).mappings().all()
    queues=[]
    for name,source in [('notifications','notification_outbox e'),('email','notification_email_deliveries e JOIN notifications n ON n.id=e.notification_id')]:
        scope='e.workspace_id' if name=='notifications' else 'n.workspace_id'
        row=(await db.execute(text(f'''SELECT COUNT(*) FILTER(WHERE e.delivered_at IS NULL AND e.failed_at IS NULL) AS pending,
            COUNT(*) FILTER(WHERE e.failed_at IS NOT NULL) AS failed,
            MIN(e.available_at) FILTER(WHERE e.delivered_at IS NULL AND e.failed_at IS NULL AND e.available_at<=:now) AS oldest
            FROM {source} WHERE {scope}=:workspace'''),{'workspace':workspaceId,'now':now})).mappings().one()
        queues.append({'name':name,'pending':row['pending'],'failed':row['failed'],'lagSeconds':max(0,int((now-row['oldest']).total_seconds())) if row['oldest'] else 0})
    sla=(await db.execute(text('''SELECT COUNT(*) FILTER(WHERE j.failed_at IS NULL AND j.next_attempt_at<=:now) AS pending,
        COUNT(*) FILTER(WHERE j.failed_at IS NOT NULL) AS failed,
        MIN(j.next_attempt_at) FILTER(WHERE j.failed_at IS NULL AND j.next_attempt_at<=:now) AS oldest
        FROM issue_sla_jobs j JOIN issues i ON i.id=j.issue_id JOIN teams t ON t.id=i.team_id
        WHERE i.workspace_id=:workspace AND t.archived_at IS NULL AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=i.team_id AND tm.user_id=:user)'''),
        {'workspace':workspaceId,'user':user['id'],'now':now})).mappings().one()
    queues.append({'name':'sla','pending':sla['pending'],'failed':sla['failed'],'lagSeconds':max(0,int((now-sla['oldest']).total_seconds())) if sla['oldest'] else 0})
    return {'data':{**build_identity(),'jobsTruncated':truncated,'jobs':[{'instance':r['instance_id'],'job':r['job'],'status':'stale' if r['last_seen_at']<now-timedelta(seconds=60) else r['status'],
        'lastSeenAt':r['last_seen_at'],'lastProgressAt':r['last_progress_at'],'failures':r['failures'],'lastErrorCode':r['last_error_code']} for r in jobs],
        'clientErrors':[dict(r) for r in errors],'queues':queues}}
