from datetime import timedelta
from typing import Literal

from fastapi import Depends, Request
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.identifiers import cuid
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from ..access.projects import workspace_access, workspace_manager
from ..identity.auth import current_user
from ..identity.password_reset import limit_request
from .commands import (
    CLIENT_ERROR_INSERT_CLIENT_ERROR_EVENTS,
)
from .diagnostics import build_identity
from .job_query import visible_jobs
from .queries import (
    OVERVIEW_SELECT_CLIENT_ERROR_EVENTS,
    OVERVIEW_SELECT_ISSUE_SLA_JOBS,
    overview_select_sql,
)

router=UtcAPIRouter(prefix='/api/v1/operations',tags=['operations'])


class ClientError(BaseModel):
    model_config=ConfigDict(extra='forbid')
    workspaceId:str=Field(min_length=1)
    category:Literal['render','unhandled','network']
    routeKind:Literal['issue','project','initiative','view','settings','inbox','other']
    digest:str|None=Field(default=None,pattern=r'^[A-Za-z0-9_-]{1,64}$')


@router.post('/client-errors')
async def client_error(payload:ClientError,request:Request,user=Depends(current_user),db:AsyncSession=Depends(get_session)):
    await workspace_access(db,payload.workspaceId,user['id'])
    await limit_request(db,request.app.state.settings.auth_jwt_secret,'client-error',user['id'],60)
    identifier=cuid()
    await db.execute(CLIENT_ERROR_INSERT_CLIENT_ERROR_EVENTS,{'id':identifier,'workspace':payload.workspaceId,'user':user['id'],
        'category':payload.category,'route':payload.routeKind,'digest':payload.digest,'now':utcnow()})
    await db.commit()
    return {'data':{'reference':identifier}}


@router.get('')
async def overview(workspaceId:str,user=Depends(current_user),db:AsyncSession=Depends(get_session)):
    await workspace_manager(db,workspaceId,user['id'])
    now=utcnow()
    jobs,truncated=await visible_jobs(db,now)
    errors=(await db.execute(OVERVIEW_SELECT_CLIENT_ERROR_EVENTS,{'workspace':workspaceId,'cutoff':now-timedelta(days=1)})).mappings().all()
    queues=[]
    for name,source in [('notifications','notification_outbox e'),('email','notification_email_deliveries e JOIN notifications n ON n.id=e.notification_id')]:
        scope='e.workspace_id' if name=='notifications' else 'n.workspace_id'
        row=(await db.execute(overview_select_sql(source, scope),{'workspace':workspaceId,'now':now})).mappings().one()
        queues.append({'name':name,'pending':row['pending'],'failed':row['failed'],'lagSeconds':max(0,int((now-row['oldest']).total_seconds())) if row['oldest'] else 0})
    sla=(await db.execute(OVERVIEW_SELECT_ISSUE_SLA_JOBS,
        {'workspace':workspaceId,'user':user['id'],'now':now})).mappings().one()
    queues.append({'name':'sla','pending':sla['pending'],'failed':sla['failed'],'lagSeconds':max(0,int((now-sla['oldest']).total_seconds())) if sla['oldest'] else 0})
    return {'data':{**build_identity(),'jobsTruncated':truncated,'jobs':[{'instance':r['instance_id'],'job':r['job'],'status':'stale' if r['last_seen_at']<now-timedelta(seconds=60) else r['status'],
        'lastSeenAt':r['last_seen_at'],'lastProgressAt':r['last_progress_at'],'failures':r['failures'],'lastErrorCode':r['last_error_code']} for r in jobs],
        'clientErrors':[dict(r) for r in errors],'queues':queues}}
