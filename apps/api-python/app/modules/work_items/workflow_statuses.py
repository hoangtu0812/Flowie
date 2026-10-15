from datetime import datetime, timezone
import json
from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy import text

from ...core.clock import _utcnow
from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ...core.audit_context import audit_source
from ..access.projects import _workspace_access, _workspace_manager, _team_access

Category = Literal['TRIAGE', 'BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELED']


class StatusValues(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    category: Category
    color: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    position: int = Field(default=0, ge=0, le=10000)


class CreateStatus(StatusValues):
    workspaceId: str = Field(min_length=1)


class EditStatus(StatusValues):
    expectedUpdatedAt: datetime


async def statuses(db, workspace, user):
    await _workspace_access(db, workspace, user['id'])
    rows = (await db.execute(text('''SELECT s.*,
        (SELECT COUNT(*) FROM issues i WHERE i.status_id=s.id) AS issue_count
        FROM issue_statuses s WHERE s.workspace_id=:workspace AND
        (s.team_id IS NULL OR EXISTS (SELECT 1 FROM team_members tm JOIN teams t ON t.id=tm.team_id
        WHERE t.id=s.team_id AND t.archived_at IS NULL AND tm.user_id=:user))
        ORDER BY s.position,s.name,s.id'''), {'workspace':workspace,'user':user['id']})).mappings().all()
    return [{'id':r['id'],'name':r['name'],'category':r['category'],'color':r['color'],
             'position':r['position'],'teamId':r['team_id'],'issueCount':r['issue_count'],
             'updatedAt':r['updated_at']} for r in rows]


async def mutate_status(db, workspace, user, values=None, *, identifier=None, expected=None, remove=False):
    await _workspace_manager(db, workspace, user['id'])
    await db.execute(text('SELECT pg_advisory_xact_lock(hashtextextended(:scope,0))'), {'scope':'issue-statuses:'+workspace})
    previous = None
    if identifier:
        previous = (await db.execute(text('SELECT * FROM issue_statuses WHERE id=:id AND workspace_id=:workspace FOR UPDATE'), {'id':identifier,'workspace':workspace})).mappings().first()
        if not previous:
            raise ApiError(404,'Issue status not found.','Not Found')
        if previous['team_id']:
            await _team_access(db,workspace,previous['team_id'],user['id'])
        instant = expected.astimezone(timezone.utc).replace(tzinfo=None) if expected and expected.tzinfo else expected
        if instant != previous['updated_at']:
            raise ApiError(409,'This status changed. Reload before saving.','Conflict')
        references = (await db.execute(text('''SELECT
            EXISTS(SELECT 1 FROM issues WHERE status_id=:id) OR
            EXISTS(SELECT 1 FROM issue_templates WHERE status_id=:id)'''), {'id':identifier})).scalar_one()
        if references and (remove or values['category']!=previous['category']):
            raise ApiError(409,'A status used by issues or templates cannot be deleted or change category.','Conflict')
        if previous['team_id'] is None and (remove or values['category']!=previous['category']):
            count = (await db.execute(text('SELECT COUNT(*) FROM issue_statuses WHERE workspace_id=:workspace AND team_id IS NULL AND category=:category'), {'workspace':workspace,'category':previous['category']})).scalar_one()
            if count<=1:
                raise ApiError(409,'Keep at least one workspace status in each workflow category.','Conflict')
    now = _utcnow()
    if remove:
        await db.execute(text('DELETE FROM issue_statuses WHERE id=:id'), {'id':identifier})
    else:
        values = {**values,'name':values['name'].strip()}
        if not values['name']:
            raise ApiError(400,'Status name is required.','Bad Request')
        duplicate = (await db.execute(text('''SELECT id FROM issue_statuses WHERE workspace_id=:workspace
            AND team_id IS NOT DISTINCT FROM :team AND lower(name)=lower(:name) AND id<>:id'''),
            {'workspace':workspace,'team':previous['team_id'] if previous else None,'name':values['name'],'id':identifier or ''})).first()
        if duplicate:
            raise ApiError(409,'A status with this name already exists.','Conflict')
        if identifier:
            await db.execute(text('''UPDATE issue_statuses SET name=:name,category=:category,color=:color,
                position=:position,updated_at=:now WHERE id=:id'''), {**values,'now':now,'id':identifier})
        else:
            identifier = _cuid()
            await db.execute(text('''INSERT INTO issue_statuses(id,workspace_id,name,category,color,position,created_at,updated_at)
                VALUES (:id,:workspace,:name,:category,:color,:position,:now,:now)'''), {**values,'id':identifier,'workspace':workspace,'now':now})
    team=previous['team_id'] if previous else None
    await db.execute(text('''INSERT INTO audit_logs(id,workspace_id,actor_id,action,entity_type,entity_id,metadata,created_at)
        VALUES (:audit,:workspace,:user,:action,'issue-status',:id,CAST(:metadata AS jsonb),:now)'''), {'audit':_cuid(),'workspace':workspace,'user':user['id'],
        'action':'issue-status.deleted' if remove else 'issue-status.saved','id':identifier,'now':now,
        'metadata':json.dumps({'source':audit_source.get(),'scope':'TEAM' if team else 'WORKSPACE','teamId':team})})
    return identifier
