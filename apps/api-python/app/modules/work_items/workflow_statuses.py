import json
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field

from ...core.audit_context import audit_source
from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ..access.projects import team_access, workspace_access, workspace_manager
from .commands import (
    MUTATE_STATUS_DELETE_ISSUE_STATUSES,
    MUTATE_STATUS_INSERT_AUDIT_LOGS,
    MUTATE_STATUS_INSERT_ISSUE_STATUSES,
    MUTATE_STATUS_LOCK,
    MUTATE_STATUS_UPDATE_ISSUE_STATUSES,
)
from .queries import (
    MUTATE_STATUS_SELECT_ISSUE_STATUSES,
    MUTATE_STATUS_SELECT_ISSUE_STATUSES_2,
    MUTATE_STATUS_SELECT_ISSUE_STATUSES_3,
    MUTATE_STATUS_SELECT_ISSUES,
    STATUSES_SELECT_ISSUES,
)

Category = Literal['TRIAGE', 'BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELED']


class StatusValues(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: Category
    color: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    position: int = Field(default=0, ge=0, le=10000)
    requiredBeforeStart: bool = False


class CreateStatus(StatusValues):
    workspaceId: str = Field(min_length=1)


class EditStatus(StatusValues):
    expectedUpdatedAt: datetime


async def statuses(db, workspace, user):
    await workspace_access(db, workspace, user['id'])
    rows = (await db.execute(STATUSES_SELECT_ISSUES, {'workspace':workspace,'user':user['id']})).mappings().all()
    return [{'id':r['id'],'name':r['name'],'category':r['category'],'color':r['color'],
             'position':r['position'],'teamId':r['team_id'],'issueCount':r['issue_count'],
             'requiredBeforeStart':r['required_before_start'],
             'updatedAt':r['updated_at']} for r in rows]


async def mutate_status(db, workspace, user, values=None, *, identifier=None, expected=None, remove=False):
    await workspace_manager(db, workspace, user['id'])
    await db.execute(MUTATE_STATUS_LOCK, {'scope':'issue-statuses:'+workspace})
    previous = None
    if identifier:
        previous = (await db.execute(MUTATE_STATUS_SELECT_ISSUE_STATUSES_3, {'id':identifier,'workspace':workspace})).mappings().first()
        if not previous:
            raise ApiError(404,'Issue status not found.','Not Found')
        if previous['team_id']:
            await team_access(db,workspace,previous['team_id'],user['id'])
        instant = expected.astimezone(UTC).replace(tzinfo=None) if expected and expected.tzinfo else expected
        if instant != previous['updated_at']:
            raise ApiError(409,'This status changed. Reload before saving.','Conflict')
        references = (await db.execute(MUTATE_STATUS_SELECT_ISSUES, {'id':identifier})).scalar_one()
        if references and (remove or values['category']!=previous['category']):
            raise ApiError(409,'A status used by issues or templates cannot be deleted or change category.','Conflict')
        if previous['team_id'] is None and (remove or values['category']!=previous['category']):
            count = (await db.execute(MUTATE_STATUS_SELECT_ISSUE_STATUSES_2, {'workspace':workspace,'category':previous['category']})).scalar_one()
            if count<=1:
                raise ApiError(409,'Keep at least one workspace status in each workflow category.','Conflict')
    now = utcnow()
    if remove:
        await db.execute(MUTATE_STATUS_DELETE_ISSUE_STATUSES, {'id':identifier})
    else:
        values = {**values,'name':values['name'].strip(),'requiredBeforeStart':values.get('requiredBeforeStart',False)}
        if not values['name']:
            raise ApiError(400,'Status name is required.','Bad Request')
        # The start gate is the step before work, so it must sit before STARTED.
        # VI: Cổng bắt đầu là bước trước khi làm nên phải nằm trước nhóm STARTED.
        if values['requiredBeforeStart'] and values['category'] not in ('TRIAGE','BACKLOG','UNSTARTED'):
            raise ApiError(400,'Only Triage, Backlog or Unstarted statuses can be required before start.','Bad Request')
        duplicate = (await db.execute(MUTATE_STATUS_SELECT_ISSUE_STATUSES,
            {'workspace':workspace,'team':previous['team_id'] if previous else None,'name':values['name'],'id':identifier or ''})).first()
        if duplicate:
            raise ApiError(409,'A status with this name already exists.','Conflict')
        if identifier:
            await db.execute(MUTATE_STATUS_UPDATE_ISSUE_STATUSES, {**values,'now':now,'id':identifier})
        else:
            identifier = cuid()
            await db.execute(MUTATE_STATUS_INSERT_ISSUE_STATUSES, {**values,'id':identifier,'workspace':workspace,'now':now})
    team=previous['team_id'] if previous else None
    await db.execute(MUTATE_STATUS_INSERT_AUDIT_LOGS, {'audit':cuid(),'workspace':workspace,'user':user['id'],
        'action':'issue-status.deleted' if remove else 'issue-status.saved','id':identifier,'now':now,
        'metadata':json.dumps({'source':audit_source.get(),'scope':'TEAM' if team else 'WORKSPACE','teamId':team})})
    return identifier
