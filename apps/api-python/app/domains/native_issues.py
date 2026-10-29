from __future__ import annotations

from ..modules.access.project_scope import project_read_scope

from datetime import timedelta

from ..modules.work_items.issue_relations import _relation_kind as _relation_kind

from ..modules.work_items.issue_relations import _add_issue_relation as _add_issue_relation

from ..modules.work_items.issue_activity import _write_activity as _write_activity, _transition as _transition

from ..modules.work_items.issue_rules import _validate_schedule_dates as _validate_schedule_dates, _ensure_circle_issue_statuses as _ensure_circle_issue_statuses, _validate_references as _validate_references, _validate_release_ids as _validate_release_ids, _validate_template_references as _validate_template_references

from ..modules.work_items.issue_hierarchy import issue_ancestors
from ..modules.work_items.issue_queries import _issue_row as _issue_row, _relation_summary as _relation_summary, _template_row as _template_row, _status_name as _status_name, _person_name as _person_name, _project_name as _project_name

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Annotated

from fastapi import Depends, Query, Request
from ..core.utc_responses import UtcAPIRouter as APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..modules.work_items.contracts import CreateIssueInput, UpdateIssueInput
from ..core.errors import ApiError
from ..db.session import get_session
from ..services.notification_events import (
    create_notification_batch,
    issue_recipient_ids,
    publish_notification_batches,
    team_recipient_ids,
)
from .auth import _cuid, _utcnow, current_user
from .native_projects import _date, _team_access, _workspace_access
from .native_slas import resolve_deadline
from .teams import _manager
from .workflow_catalog import DEFAULT_CIRCLE_ISSUE_STATUSES


# Mutations remain staged under the private prefix. Read endpoints are exposed
# through the audited public router below once their Circle adapter is ready.
router = APIRouter(prefix='/api/v1/_native/issues', tags=['native-issues'])
public_router = APIRouter(prefix='/api/v1/issues', tags=['issues'])

IssuePriority = Literal['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']
IssueCategory = Literal['TRIAGE', 'BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELED']








class IssueReactionInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    emoji: str = Field(min_length=1, max_length=32)


class IssueRelationInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    relatedIssueId: str = Field(min_length=1)
    type: Literal['RELATED', 'BLOCKS'] = 'RELATED'


class UpdateIssueRelationInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    type: Literal['RELATED', 'BLOCKS']


class MoveIssueInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    teamId: str | None = Field(default=None, min_length=1)


class ClassifyIssueInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    resolution: Literal['DUPLICATE', 'WONT_FIX']
    duplicateOfIdentifier: str | None = Field(default=None, max_length=100)


class ConvertIssueToCommentInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    targetIdentifier: str = Field(min_length=3, max_length=100, pattern=r'^[A-Za-z0-9][A-Za-z0-9_-]*-\d+$')


class IssueReminderInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    remindAt: datetime


class CreateIssueTemplateInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    title: str = Field(min_length=2, max_length=500)
    issueDescription: str | None = Field(default=None, max_length=10_000)
    statusId: str | None = None
    priority: IssuePriority = 'NONE'
    projectId: str | None = None
    assigneeId: str | None = None
    labelIds: list[str] | None = Field(default=None, max_length=100)


class UpdateIssueTemplateInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    title: str | None = Field(default=None, min_length=2, max_length=500)
    issueDescription: str | None = Field(default=None, max_length=10_000)
    statusId: str | None = None
    priority: IssuePriority | None = None
    projectId: str | None = None
    assigneeId: str | None = None
    labelIds: list[str] | None = Field(default=None, max_length=100)












def _template(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'name': row['name'],
        'description': row['description'], 'title': row['title'],
        'issueDescription': row['issue_description'], 'statusId': row['status_id'],
        'priority': row['priority'], 'projectId': row['project_id'],
        'assigneeId': row['assignee_id'], 'labelIds': row['label_ids'] or [],
        'createdById': row['created_by'], 'createdAt': row['created_at'],
        'updatedAt': row['updated_at'],
        'createdBy': {'id': row['creator_id'], 'name': row['creator_name'], 'avatarUrl': row['creator_avatar_url']},
    }








@router.get('')
@public_router.get('')
async def list_issues(
    workspaceId: str = Query(min_length=1), teamId: str | None = None,
    categories: str | None = None, scope: Literal['assigned', 'created', 'subscribed', 'activity'] | None = None,
    user: Any = Depends(current_user), db: AsyncSession = Depends(get_session), *,
    request: Request = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    cursor: Annotated[str | None, Query(max_length=2000)] = None,
    projectId: str | None = None, assigneeId: str | None = None, creatorId: str | None = None,
    cycleId: str | None = None, query: Annotated[str | None, Query(max_length=200)] = None,
    filters: Annotated[str | None, Query(max_length=12000)] = None, includeSubIssues: bool = True,
    noTeam: bool = False, noProject: bool = False,
    issueType: Literal["TASK", "BUG"] | None = None,
    insights: bool = False,
    sliceBy: Literal['status','priority','assignee','project'] = 'status',
    segmentBy: Literal['status','priority','assignee','project'] = 'priority',
) -> dict:
    from ..modules.work_items.issue_search import search_page
    from ..core.config import Settings
    await _workspace_access(db, workspaceId, user['id'])
    if teamId:
        await _team_access(db, workspaceId, teamId, user['id'])
    settings = request.app.state.settings if request else Settings.from_environment()
    options = {
        'teamId': teamId, 'categories': categories, 'scope': scope, 'limit': limit, 'cursor': cursor,
        'projectId': projectId, 'assigneeId': assigneeId, 'creatorId': creatorId, 'cycleId': cycleId,
        'query': query, 'filters': filters, 'includeSubIssues': includeSubIssues,
        'noTeam': noTeam, 'noProject': noProject, 'issueType': issueType,
    }
    if insights:
        from ..modules.work_items.issue_insights import issue_insights
        return {'data':await issue_insights(db,workspaceId,user['id'],options,sliceBy,segmentBy)}
    return await search_page(db, workspaceId, user['id'], settings.auth_jwt_secret, options)


@public_router.get('/lookup/{reference}')
async def lookup_issue(reference: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict:
    if len(reference) > 100:
        raise ApiError(400, 'Invalid issue reference.', 'Bad Request')
    await _workspace_access(db, workspaceId, user['id'])
    row = (await db.execute(text('SELECT id FROM issues WHERE workspace_id=:workspace AND (id=:reference OR identifier=:reference) AND archived_at IS NULL LIMIT 1'), {'workspace': workspaceId, 'reference': reference})).mappings().first()
    if not row:
        raise ApiError(404, 'Issue not found.', 'Not Found')
    issue = await _issue_row(db, row['id'], workspaceId, user['id'])
    # Only the issue page reads this endpoint, so the parent chain for its breadcrumb is added here
    # instead of to every list row.
    # VI: Chỉ trang issue đọc endpoint này, nên chuỗi cha cho breadcrumb được thêm ở đây thay vì vào
    # VI: mọi dòng danh sách.
    issue['ancestors'] = await issue_ancestors(db, workspaceId, row['id'])
    return {'data': issue}


@router.get('/options')
async def issue_options(
    workspaceId: str = Query(min_length=1),
    teamId: str | None = None,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
    noTeam: bool = False,
) -> dict[str, dict[str, list[dict[str, Any]]]]:
    await _workspace_access(db, workspaceId, user['id'])
    if teamId:
        await _team_access(db, workspaceId, teamId, user['id'])
    await _ensure_circle_issue_statuses(db, workspaceId)
    await db.commit()
    team_filter = 'AND team_id IS NULL' if noTeam else ('AND (team_id IS NULL OR team_id = :team_id)' if teamId else '')
    params = {'workspace_id': workspaceId, 'team_id': teamId, 'user_id': user['id']}
    statuses, projects, members, labels, cycles = await db.execute(
        text(f'''SELECT id, name, category, color, position FROM issue_statuses WHERE workspace_id = :workspace_id {team_filter}
            AND (team_id IS NULL OR EXISTS (SELECT 1 FROM teams scope_t JOIN team_members scope_tm ON scope_tm.team_id=scope_t.id
            WHERE scope_t.id=issue_statuses.team_id AND scope_t.workspace_id=:workspace_id AND scope_t.archived_at IS NULL AND scope_tm.user_id=:user_id)) ORDER BY position, name'''), params
    ), await db.execute(
        text(f'''SELECT p.id,p.name,p.identifier,p.status,p.priority,p.health,p.start_date,p.target_date,p.lead_id,p.team_id
            FROM projects p WHERE {project_read_scope(workspace='workspace_id', user='user_id')} {"AND p.team_id IS NULL" if noTeam else ("AND (p.team_id IS NULL OR p.team_id=:team_id)" if teamId else "")} ORDER BY p.name'''), params
    ), await db.execute(
        text('''SELECT u.id, u.name, u.email, u.avatar_url, u.last_seen_at FROM workspace_members wm JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = :workspace_id AND wm.status = 'ACTIVE' ORDER BY u.name'''), {'workspace_id': workspaceId}
    ), await db.execute(
        text('SELECT id, name, color FROM labels WHERE workspace_id = :workspace_id ORDER BY name'), {'workspace_id': workspaceId}
    ), await db.execute(
        text('''SELECT id, team_id, name, status, start_date, end_date FROM cycles WHERE workspace_id = :workspace_id
            AND EXISTS (SELECT 1 FROM teams scope_t JOIN team_members scope_tm ON scope_tm.team_id=scope_t.id
            WHERE scope_t.id=cycles.team_id AND scope_t.workspace_id=:workspace_id AND scope_t.archived_at IS NULL AND scope_tm.user_id=:user_id) ''' + ('AND team_id = :team_id ' if teamId else '') + 'ORDER BY start_date DESC NULLS LAST, created_at DESC'), params
    )
    releases = await db.execute(
        text(
            '''SELECT id, name, version, status, target_date FROM releases
               WHERE workspace_id = :workspace_id AND archived_at IS NULL
               ORDER BY target_date DESC NULLS LAST, created_at DESC'''
        ),
        {'workspace_id': workspaceId},
    )
    return {'data': {
        'statuses': [{'id': row['id'], 'name': row['name'], 'category': row['category'], 'color': row['color'], 'position': row['position']} for row in statuses.mappings().all()],
        'projects': [{'id': row['id'], 'name': row['name'], 'identifier': row['identifier'], 'status': row['status'], 'priority': row['priority'], 'health': row['health'], 'startDate': row['start_date'], 'targetDate': row['target_date'], 'leadId': row['lead_id'], 'teamId': row['team_id']} for row in projects.mappings().all()],
        'members': [{'id': row['id'], 'name': row['name'], 'email': row['email'], 'avatarUrl': row['avatar_url'], 'lastSeenAt': row['last_seen_at'], 'isOnline': bool(row['last_seen_at'] and row['last_seen_at'] >= _utcnow() - timedelta(minutes=2))} for row in members.mappings().all()],
        'labels': [dict(row) for row in labels.mappings().all()],
        'cycles': [{'id': row['id'], 'teamId': row['team_id'], 'name': row['name'], 'status': row['status'], 'startDate': row['start_date'], 'endDate': row['end_date']} for row in cycles.mappings().all()],
        'releases': [{'id': row['id'], 'name': row['name'], 'version': row['version'], 'status': row['status'], 'targetDate': row['target_date']} for row in releases.mappings().all()],
    }}


# Public read contract: this is intentionally limited to the data already
# consumed by the Circle list adapter. Every other Issue route stays on the
# legacy facade or under /_native until it has comparable contract coverage.
@public_router.get('/bug-report')
async def bug_report(workspaceId: str = Query(min_length=1), teamId: str | None = None,
    projectId: str | None = None, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict:
    from ..modules.work_items.bug_reports import report
    return {'data': await report(db, workspaceId, user['id'], teamId, projectId)}


@public_router.get('/options')
async def public_issue_options(
    workspaceId: str = Query(min_length=1),
    teamId: str | None = None,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
    noTeam: bool = False,
) -> dict[str, dict[str, list[dict[str, Any]]]]:
    return await issue_options(workspaceId, teamId, user, db, noTeam)


@router.post('')
async def create_issue(
    payload: CreateIssueInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    from ..modules.work_items.issues import create_issue as operation
    from ..db.mutations import commit_mutation

    return await commit_mutation(db, lambda: operation(payload=payload, user=user, db=db))


@public_router.post('')
async def public_create_issue(
    payload: CreateIssueInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    """Audited create contract for the untouched Circle Create Issue dialog."""
    return await create_issue(payload, user, db)




@router.get('/templates')
@public_router.get('/templates')
async def list_issue_templates(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    result = await db.execute(
        text(
            '''SELECT template.*, creator.id AS creator_id, creator.name AS creator_name,
                      creator.avatar_url AS creator_avatar_url
               FROM issue_templates template
               JOIN users creator ON creator.id = template.created_by
               WHERE template.workspace_id = :workspace_id
               ORDER BY template.name'''
        ),
        {'workspace_id': workspaceId},
    )
    return {'data': [_template(row) for row in result.mappings().all()]}


@router.post('/templates')
@public_router.post('/templates')
async def create_issue_template(
    payload: CreateIssueTemplateInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _manager(db, payload.workspaceId, user['id'])
    values = payload.model_dump()
    await _validate_template_references(db, payload.workspaceId, values)
    template_id, now = _cuid(), _utcnow()
    await db.execute(
        text(
            '''INSERT INTO issue_templates
               (id, workspace_id, name, description, title, issue_description, status_id,
                priority, project_id, assignee_id, label_ids, created_by, created_at, updated_at)
               VALUES (:id, :workspace_id, :name, :description, :title, :issue_description, :status_id,
                :priority, :project_id, :assignee_id, :label_ids, :created_by, :now, :now)'''
        ),
        {
            'id': template_id, 'workspace_id': payload.workspaceId,
            'name': payload.name.strip(), 'description': values.get('description'),
            'title': payload.title.strip(), 'issue_description': values.get('issueDescription'),
            'status_id': values.get('statusId'), 'priority': values['priority'],
            'project_id': values.get('projectId'), 'assignee_id': values.get('assigneeId'),
            'label_ids': values.get('labelIds') or [], 'created_by': user['id'], 'now': now,
        },
    )
    await db.commit()
    return {'data': _template(await _template_row(db, template_id, payload.workspaceId))}


@router.patch('/templates/{template_id}')
@public_router.patch('/templates/{template_id}')
async def update_issue_template(
    template_id: str,
    payload: UpdateIssueTemplateInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    if not await _template_row(db, template_id, workspaceId):
        raise ApiError(404, 'Issue template not found.', 'Not Found')
    values = payload.model_dump(exclude_unset=True)
    await _validate_template_references(db, workspaceId, values)
    columns = {'name': 'name', 'description': 'description', 'title': 'title', 'issueDescription': 'issue_description', 'statusId': 'status_id', 'priority': 'priority', 'projectId': 'project_id', 'assigneeId': 'assignee_id', 'labelIds': 'label_ids'}
    sets, params = [], {'template_id': template_id, 'workspace_id': workspaceId, 'now': _utcnow()}
    for field, column in columns.items():
        if field in values:
            params[field] = values[field].strip() if field in {'name', 'title'} and values[field] else values[field]
            sets.append(f'{column} = :{field}')
    if sets:
        await db.execute(text(f"UPDATE issue_templates SET {', '.join(sets)}, updated_at = :now WHERE id = :template_id AND workspace_id = :workspace_id"), params)
        await db.commit()
    return {'data': _template(await _template_row(db, template_id, workspaceId))}


@router.delete('/templates/{template_id}')
@public_router.delete('/templates/{template_id}')
async def delete_issue_template(
    template_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _manager(db, workspaceId, user['id'])
    result = await db.execute(text('DELETE FROM issue_templates WHERE id = :template_id AND workspace_id = :workspace_id RETURNING id'), {'template_id': template_id, 'workspace_id': workspaceId})
    if result.scalar_one_or_none() is None:
        raise ApiError(404, 'Issue template not found.', 'Not Found')
    await db.commit()
    return {'data': {'id': template_id, 'deleted': True}}


# Upper bound on sub-issue tree depth. The parent-cycle trigger makes deeper trees unreachable in
# practice; the bound only stops a recursive query on rows written before that trigger existed.
# VI: Giới hạn độ sâu cây sub-issue. Trigger chặn chu trình khiến cây sâu hơn gần như không có; giới
# VI: hạn này chỉ để truy vấn đệ quy dừng với dữ liệu ghi trước khi có trigger.
SUB_ISSUE_MAX_DEPTH = 50


async def _descendant_ids(db: AsyncSession, workspace_id: str, team_id: str | None, issue_id: str) -> list[str]:
    """Ids of every active descendant of an issue in the same team, parents before children.
    An archived issue hides its whole branch, matching what the sub-issue tree shows.
    VI: Id của mọi hậu duệ chưa archive cùng team của một issue, cha đứng trước con. Issue đã
    VI: archive ẩn cả nhánh của nó, khớp với những gì cây sub-issue hiển thị.
    """
    result = await db.execute(
        text(
            '''WITH RECURSIVE tree AS (
                   SELECT child.id, 1 AS depth FROM issues child
                   WHERE child.workspace_id = :workspace_id AND child.team_id IS NOT DISTINCT FROM :team_id
                     AND child.parent_issue_id = :issue_id AND child.archived_at IS NULL
                   UNION ALL
                   SELECT child.id, tree.depth + 1 FROM issues child JOIN tree ON child.parent_issue_id = tree.id
                   WHERE child.workspace_id = :workspace_id AND child.team_id IS NOT DISTINCT FROM :team_id
                     AND child.archived_at IS NULL AND tree.depth < :max_depth
               )
               SELECT id FROM tree GROUP BY id ORDER BY min(depth)'''
        ),
        {'workspace_id': workspace_id, 'team_id': team_id, 'issue_id': issue_id, 'max_depth': SUB_ISSUE_MAX_DEPTH},
    )
    return list(result.scalars().all())


@router.get('/{issue_id}/sub-issues')
@public_router.get('/{issue_id}/sub-issues')
async def list_sub_issues(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
    descendants: Annotated[bool, Query()] = False,
) -> dict[str, list[dict[str, Any]]]:
    """Direct children of an issue, or with `descendants=true` every level of its sub-issue tree.
    Each row carries `parentIssueId` so the client can rebuild the tree, plus the status, assignee
    and due date the tree rows show and edit.
    VI: Con trực tiếp của issue, hoặc mọi cấp của cây sub-issue khi `descendants=true`. Mỗi dòng
    VI: có `parentIssueId` để client dựng lại cây, cùng trạng thái, assignee và due date mà các
    VI: hàng của cây hiển thị và cho sửa.
    """
    parent = await _issue_row(db, issue_id, workspaceId, user['id'])
    if descendants:
        ids = await _descendant_ids(db, workspaceId, parent['teamId'], parent['id'])
    else:
        ids = list((await db.execute(
            text(
                '''SELECT id FROM issues
                   WHERE workspace_id = :workspace_id AND team_id IS NOT DISTINCT FROM :team_id
                     AND parent_issue_id = :parent_issue_id AND archived_at IS NULL'''
            ),
            {'workspace_id': workspaceId, 'team_id': parent['teamId'], 'parent_issue_id': parent['id']},
        )).scalars().all())
    result = await db.execute(
        text(
            '''SELECT child.id, child.identifier, child.title, child.parent_issue_id, child.due_date,
                      child.priority::text AS priority,
                      status.id AS status_id, status.name AS status_name,
                      status.color AS status_color, status.category AS status_category,
                      assignee.id AS assignee_id, assignee.name AS assignee_name,
                      assignee.avatar_url AS assignee_avatar_url
               FROM issues child
               JOIN issue_statuses status ON status.id = child.status_id
               LEFT JOIN users assignee ON assignee.id = child.assignee_id
               WHERE child.id = ANY(CAST(:ids AS text[]))
               ORDER BY child.updated_at DESC, child.created_at DESC'''
        ),
        {'ids': ids},
    )
    return {'data': [
        {
            'id': row['id'],
            'identifier': row['identifier'],
            'title': row['title'],
            'parentIssueId': row['parent_issue_id'],
            'dueDate': row['due_date'],
            'priority': row['priority'],
            'status': {
                'id': row['status_id'],
                'name': row['status_name'],
                'color': row['status_color'],
                'category': row['status_category'],
            },
            'assignee': {
                'id': row['assignee_id'],
                'name': row['assignee_name'],
                'avatarUrl': row['assignee_avatar_url'],
            } if row['assignee_id'] else None,
        }
        for row in result.mappings().all()
    ]}


@router.get('/{issue_id}/relations')
@public_router.get('/{issue_id}/relations')
async def list_issue_relations(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _issue_row(db, issue_id, workspaceId, user['id'])
    result = await db.execute(
        text(
            '''SELECT relation.issue_id, relation.related_issue_id, relation.type
               FROM issue_relations relation
               JOIN issues other ON other.id = CASE
                   WHEN relation.issue_id = :issue_id THEN relation.related_issue_id
                   ELSE relation.issue_id
               END
               WHERE relation.workspace_id = :workspace_id
                 AND (relation.issue_id = :issue_id OR relation.related_issue_id = :issue_id)
                 AND other.archived_at IS NULL
               ORDER BY relation.created_at DESC'''
        ),
        {'issue_id': issue_id, 'workspace_id': workspaceId},
    )
    data: list[dict[str, Any]] = []
    for relation in result.mappings().all():
        other_id = relation['related_issue_id'] if relation['issue_id'] == issue_id else relation['issue_id']
        try:
            related = await _relation_summary(db, other_id, workspaceId, user['id'])
        except ApiError as error:
            if error.status_code == 404:
                continue
            raise
        data.append({
            **related,
            'relationKind': _relation_kind(relation['type'], relation['issue_id'], issue_id),
        })
    return {'data': data}




@router.post('/{issue_id}/relations')
@public_router.post('/{issue_id}/relations')
async def add_issue_relation(
    issue_id: str,
    payload: IssueRelationInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    return {'data': await _add_issue_relation(
        db, issue_id, payload.workspaceId, payload.relatedIssueId, payload.type, user['id']
    )}


@router.patch('/{issue_id}/relations/{related_issue_id}')
@public_router.patch('/{issue_id}/relations/{related_issue_id}')
async def update_issue_relation(
    issue_id: str,
    related_issue_id: str,
    payload: UpdateIssueRelationInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    return {'data': await _add_issue_relation(
        db, issue_id, payload.workspaceId, related_issue_id, payload.type, user['id']
    )}


@router.delete('/{issue_id}/relations/{related_issue_id}')
@public_router.delete('/{issue_id}/relations/{related_issue_id}')
async def remove_issue_relation(
    issue_id: str,
    related_issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    issue = await _issue_row(db, issue_id, workspaceId, user['id'])
    related = await _issue_row(db, related_issue_id, workspaceId, user['id'])
    result = await db.execute(
        text(
            '''DELETE FROM issue_relations
               WHERE workspace_id = :workspace_id
                 AND ((issue_id = :issue_id AND related_issue_id = :related_issue_id)
                   OR (issue_id = :related_issue_id AND related_issue_id = :issue_id))
               RETURNING issue_id, related_issue_id, type'''
        ),
        {
            'workspace_id': workspaceId,
            'issue_id': issue['id'],
            'related_issue_id': related['id'],
        },
    )
    relation = result.mappings().first()
    if not relation:
        raise ApiError(404, 'Issues are not linked.', 'Not Found')
    await _write_activity(db, workspaceId, issue['id'], user['id'], 'issue.unrelated', {
        'relatedIssueId': related['id'],
        'relatedIdentifier': related['identifier'],
        'relationType': relation['type'],
        'relationKind': _relation_kind(relation['type'], relation['issue_id'], issue['id']),
    })
    await _write_activity(db, workspaceId, related['id'], user['id'], 'issue.unrelated', {
        'relatedIssueId': issue['id'],
        'relatedIdentifier': issue['identifier'],
        'relationType': relation['type'],
        'relationKind': _relation_kind(relation['type'], relation['issue_id'], related['id']),
    })
    await db.commit()
    return {'data': {'issueId': issue['id'], 'relatedIssueId': related['id'], 'removed': True}}


@router.post('/{issue_id}/move')
@public_router.post('/{issue_id}/move')
async def move_issue(
    issue_id: str,
    payload: MoveIssueInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    issue = await _issue_row(db, issue_id, payload.workspaceId, user['id'])
    from ..modules.sla.synchronization import locked_issue, sync_issue
    from ..modules.work_items.lifecycle import actor_context
    await locked_issue(db, issue_id)
    await actor_context(db, user['id'])
    issue = await _issue_row(db, issue_id, payload.workspaceId, user['id'])
    if issue['teamId'] == payload.teamId:
        return {'data': issue}
    if payload.teamId:
        await _team_access(db, payload.workspaceId, payload.teamId, user['id'])
    from ..modules.work_items.issue_numbering import allocate_issue_number
    team = await allocate_issue_number(db, payload.workspaceId, payload.teamId)
    status = await db.execute(
        text(
            '''SELECT id FROM issue_statuses
               WHERE workspace_id = :workspace_id AND category = :category
                 AND (team_id = :team_id OR team_id IS NULL)
               ORDER BY CASE WHEN team_id = :team_id THEN 0 ELSE 1 END, position ASC
               LIMIT 1'''
        ),
        {
            'workspace_id': payload.workspaceId,
            'category': issue['status']['category'],
            'team_id': payload.teamId,
        },
    )
    destination_status = status.mappings().first()
    if not destination_status:
        raise ApiError(404, 'The destination team has no compatible issue status.', 'Not Found')
    project_team_id = None
    if issue['projectId']:
        project_team = await db.execute(
            text('SELECT team_id FROM projects WHERE id = :project_id'), {'project_id': issue['projectId']}
        )
        project_team_id = project_team.scalar_one_or_none()
    now = _utcnow()
    await db.execute(text('DELETE FROM issue_cycles WHERE issue_id = :issue_id'), {'issue_id': issue_id})
    await db.execute(
        text('UPDATE issues SET parent_issue_id = NULL, updated_at = :now WHERE parent_issue_id = :issue_id'),
        {'issue_id': issue_id, 'now': now},
    )
    await db.execute(
        text(
            '''UPDATE issues
               SET team_id = :team_id, status_id = :status_id, identifier = :identifier,
                   number = :number, parent_issue_id = NULL,
                   project_id = CASE WHEN :clear_project THEN NULL ELSE project_id END,
                   updated_at = :now
               WHERE id = :issue_id AND workspace_id = :workspace_id'''
        ),
        {
            'team_id': team['id'],
            'status_id': destination_status['id'],
            'identifier': team['issue_identifier'],
            'number': team['issue_sequence'],
            'clear_project': bool(project_team_id and project_team_id != team['id']),
            'now': now,
            'issue_id': issue_id,
            'workspace_id': payload.workspaceId,
        },
    )
    await _write_activity(db, payload.workspaceId, issue_id, user['id'], 'issue.moved', {
        'fromTeamId': issue['teamId'],
        'toTeamId': team['id'],
        'identifier': team['issue_identifier'],
    })
    await sync_issue(db, issue_id)
    await db.commit()
    return {'data': await _issue_row(db, issue_id, payload.workspaceId, user['id'])}


@router.post('/{issue_id}/classification')
@public_router.post('/{issue_id}/classification')
async def classify_issue(
    issue_id: str,
    payload: ClassifyIssueInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    issue = await _issue_row(db, issue_id, payload.workspaceId, user['id'])
    from ..modules.sla.synchronization import locked_issue, sync_issue
    from ..modules.work_items.lifecycle import actor_context
    await locked_issue(db, issue_id)
    await actor_context(db, user['id'])
    issue = await _issue_row(db, issue_id, payload.workspaceId, user['id'])
    duplicate_of_id: str | None = None
    duplicate_identifier: str | None = None
    if payload.resolution == 'DUPLICATE':
        identifier = (payload.duplicateOfIdentifier or '').strip().upper()
        if not identifier:
            raise ApiError(400, 'A duplicate issue identifier is required.', 'Bad Request')
        target = await db.execute(
            text(
                '''SELECT id FROM issues WHERE workspace_id = :workspace_id
                   AND identifier = :identifier AND archived_at IS NULL LIMIT 1'''
            ),
            {'workspace_id': payload.workspaceId, 'identifier': identifier},
        )
        duplicate_of_id = target.scalar_one_or_none()
        if not duplicate_of_id:
            raise ApiError(404, 'Duplicate target issue not found.', 'Not Found')
        if duplicate_of_id == issue['id']:
            raise ApiError(400, 'An issue cannot be a duplicate of itself.', 'Bad Request')
        duplicate = await _issue_row(db, duplicate_of_id, payload.workspaceId, user['id'])
        duplicate_identifier = duplicate['identifier']
    canceled_status = await db.execute(
        text(
            '''SELECT id FROM issue_statuses
               WHERE workspace_id = :workspace_id AND category = 'CANCELED'
                 AND (team_id = :team_id OR team_id IS NULL)
               ORDER BY CASE WHEN team_id = :team_id THEN 0 ELSE 1 END, position ASC
               LIMIT 1'''
        ),
        {'workspace_id': payload.workspaceId, 'team_id': issue['teamId']},
    )
    status_id = canceled_status.scalar_one_or_none()
    if not status_id:
        raise ApiError(404, 'No canceled status is configured for this team.', 'Not Found')
    now = _utcnow()
    await db.execute(
        text(
            '''UPDATE issues SET resolution = :resolution, duplicate_of_id = :duplicate_of_id,
               status_id = :status_id, completed_at = NULL, canceled_at = :now, updated_at = :now
               WHERE id = :issue_id AND workspace_id = :workspace_id'''
        ),
        {
            'resolution': payload.resolution,
            'duplicate_of_id': duplicate_of_id,
            'status_id': status_id,
            'now': now,
            'issue_id': issue['id'],
            'workspace_id': payload.workspaceId,
        },
    )
    await _write_activity(db, payload.workspaceId, issue['id'], user['id'], 'issue.classified', {
        'resolution': payload.resolution,
        'duplicateOfId': duplicate_of_id,
        'duplicateIdentifier': duplicate_identifier,
    })
    await sync_issue(db, issue_id)
    await db.commit()
    return {'data': await _issue_row(db, issue_id, payload.workspaceId, user['id'])}


@router.post('/{issue_id}/convert-to-comment')
@public_router.post('/{issue_id}/convert-to-comment')
async def convert_issue_to_comment(
    issue_id: str,
    payload: ConvertIssueToCommentInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    source = await _issue_row(db, issue_id, payload.workspaceId, user['id'])
    from ..modules.sla.synchronization import locked_issue, sync_issue
    from ..modules.work_items.lifecycle import actor_context
    await locked_issue(db, issue_id)
    await actor_context(db, user['id'])
    source = await _issue_row(db, issue_id, payload.workspaceId, user['id'])
    target_id = await db.execute(
        text('''SELECT id FROM issues WHERE workspace_id = :workspace_id AND identifier = :identifier
                AND archived_at IS NULL LIMIT 1'''),
        {'workspace_id': payload.workspaceId, 'identifier': payload.targetIdentifier.strip().upper()},
    )
    target_issue_id = target_id.scalar_one_or_none()
    if not target_issue_id:
        raise ApiError(404, 'Target issue not found.', 'Not Found')
    if target_issue_id == source['id']:
        raise ApiError(400, 'An issue cannot be converted into its own comment.', 'Bad Request')
    target = await _issue_row(db, target_issue_id, payload.workspaceId, user['id'])
    actor = await db.execute(text('SELECT id, name, avatar_url FROM users WHERE id = :user_id'), {'user_id': user['id']})
    actor_row = actor.mappings().one()
    content = '\n\n'.join(filter(None, [f"**{source['identifier']}: {source['title']}**", (source['description'] or '').strip()]))
    body = {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': content}]}]}
    comment_id, now = _cuid(), _utcnow()
    await db.execute(
        text('''INSERT INTO comments (id, issue_id, author_id, content, body, created_at, updated_at)
                VALUES (:id, :issue_id, :author_id, :content, CAST(:body AS jsonb), :now, :now)'''),
        {'id': comment_id, 'issue_id': target['id'], 'author_id': user['id'], 'content': content, 'body': json.dumps(body), 'now': now},
    )
    await _write_activity(db, payload.workspaceId, target['id'], user['id'], 'comment.created', {
        'commentId': comment_id, 'convertedFromIssueId': source['id'], 'convertedFromIdentifier': source['identifier'],
    })
    await _write_activity(db, payload.workspaceId, source['id'], user['id'], 'issue.converted_to_comment', {
        'commentId': comment_id, 'targetIssueId': target['id'], 'targetIdentifier': target['identifier'],
    })
    await db.execute(text('UPDATE issues SET archived_at = :now, updated_at = :now WHERE id = :issue_id'), {'issue_id': source['id'], 'now': now})
    await sync_issue(db, issue_id)
    await db.commit()
    return {'data': {
        'comment': {'id': comment_id, 'issueId': target['id'], 'authorId': user['id'], 'content': content, 'body': body, 'createdAt': now, 'updatedAt': now, 'deletedAt': None, 'author': {'id': actor_row['id'], 'name': actor_row['name'], 'avatarUrl': actor_row['avatar_url']}},
        'sourceIssueId': source['id'], 'targetIssueId': target['id'], 'targetIdentifier': target['identifier'],
    }}


@router.post('/{issue_id}/reminder')
@public_router.post('/{issue_id}/reminder')
async def set_issue_reminder(
    issue_id: str,
    payload: IssueReminderInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _issue_row(db, issue_id, payload.workspaceId, user['id'])
    remind_at = (
        payload.remindAt.astimezone(timezone.utc).replace(tzinfo=None)
        if payload.remindAt.tzinfo
        else payload.remindAt
    )
    now = _utcnow()
    if remind_at <= now:
        raise ApiError(400, 'Reminder time must be in the future.', 'Bad Request')
    if remind_at > now + timedelta(days=366):
        raise ApiError(400, 'Reminder time may not be more than one year away.', 'Bad Request')
    result = await db.execute(
        text(
            '''INSERT INTO issue_reminders (id, issue_id, user_id, remind_at, delivered_at, created_at, updated_at)
               VALUES (:id, :issue_id, :user_id, :remind_at, NULL, :now, :now)
               ON CONFLICT (issue_id, user_id) DO UPDATE
               SET remind_at = EXCLUDED.remind_at, delivered_at = NULL, updated_at = EXCLUDED.updated_at
               RETURNING id, issue_id, user_id, remind_at, delivered_at, created_at, updated_at'''
        ),
        {'id': _cuid(), 'issue_id': issue_id, 'user_id': user['id'], 'remind_at': remind_at, 'now': now},
    )
    reminder = result.mappings().one()
    await db.commit()
    return {'data': {'id': reminder['id'], 'issueId': reminder['issue_id'], 'userId': reminder['user_id'], 'remindAt': reminder['remind_at'], 'deliveredAt': reminder['delivered_at'], 'createdAt': reminder['created_at'], 'updatedAt': reminder['updated_at']}}


@router.delete('/{issue_id}/reminder')
@public_router.delete('/{issue_id}/reminder')
async def cancel_issue_reminder(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _issue_row(db, issue_id, workspaceId, user['id'])
    await db.execute(text('DELETE FROM issue_reminders WHERE issue_id = :issue_id AND user_id = :user_id'), {'issue_id': issue_id, 'user_id': user['id']})
    await db.commit()
    return {'data': {'issueId': issue_id, 'reminder': None}}


@router.get('/{issue_id}')
async def get_issue(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, workspaceId, user['id'])
    return {'data': await _issue_row(db, issue_id, workspaceId, user['id'])}










@router.patch('/{issue_id}')
async def update_issue(
    issue_id: str,
    payload: UpdateIssueInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    from ..modules.work_items.issues import update_issue as operation
    from ..db.mutations import commit_mutation

    return await commit_mutation(db, lambda: operation(issue_id=issue_id, payload=payload, workspaceId=workspaceId, user=user, db=db))


@router.delete('/{issue_id}')
async def archive_issue(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
    includeSubIssues: Annotated[bool, Query()] = False,
) -> dict[str, dict[str, Any]]:
    """Archives an issue; with `includeSubIssues=true` also every active descendant in the same
    team, in one transaction with an `issue.archived` activity per issue. Without the flag the
    children stay active and become roots wherever the parent is no longer shown.
    VI: Archive một issue; khi `includeSubIssues=true` archive luôn mọi hậu duệ chưa archive cùng
    VI: team trong cùng transaction, mỗi issue có activity `issue.archived`. Không có cờ thì các
    VI: con vẫn hoạt động và thành gốc ở nơi không còn hiển thị cha.
    """
    issue = await _issue_row(db, issue_id, workspaceId, user['id'])
    from ..modules.sla.synchronization import locked_issue, sync_issue
    from ..modules.work_items.lifecycle import actor_context
    await locked_issue(db, issue_id)
    await actor_context(db, user['id'])
    await _issue_row(db, issue_id, workspaceId, user['id'])
    archived_ids = [issue_id]
    if includeSubIssues:
        descendant_ids = await _descendant_ids(db, workspaceId, issue['teamId'], issue_id)
        for descendant_id in descendant_ids:
            await locked_issue(db, descendant_id)
        archived_ids += descendant_ids
    now = _utcnow()
    await db.execute(
        text('UPDATE issues SET archived_at = :now, updated_at = :now WHERE id = ANY(CAST(:ids AS text[])) AND workspace_id = :workspace_id AND archived_at IS NULL'),
        {'ids': archived_ids, 'workspace_id': workspaceId, 'now': now},
    )
    for archived_id in archived_ids:
        await _write_activity(db, workspaceId, archived_id, user['id'], 'issue.archived', {})
        await sync_issue(db, archived_id)
    await db.commit()
    return {'data': {'id': issue_id, 'archivedAt': now, 'archivedIds': archived_ids}}


@public_router.get('/c{issue_suffix}')
async def public_get_issue(
    issue_suffix: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    return await get_issue(f'c{issue_suffix}', workspaceId, user, db)


@public_router.patch('/c{issue_suffix}')
async def public_update_issue(
    issue_suffix: str,
    payload: UpdateIssueInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    return await update_issue(f'c{issue_suffix}', payload, workspaceId, user, db)


@public_router.delete('/c{issue_suffix}')
async def public_archive_issue(
    issue_suffix: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
    includeSubIssues: Annotated[bool, Query()] = False,
) -> dict[str, dict[str, Any]]:
    return await archive_issue(f'c{issue_suffix}', workspaceId, user, db, includeSubIssues)


@router.post('/{issue_id}/subscribers/me')
@public_router.post('/{issue_id}/subscribers/me')
async def subscribe_issue(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _issue_row(db, issue_id, workspaceId, user['id'])
    await db.execute(
        text('''INSERT INTO issue_subscriptions (issue_id, user_id) VALUES (:issue_id, :user_id)
                ON CONFLICT DO NOTHING'''),
        {'issue_id': issue_id, 'user_id': user['id']},
    )
    await db.commit()
    return {'data': {'issueId': issue_id, 'userId': user['id'], 'subscribed': True}}


@router.delete('/{issue_id}/subscribers/me')
@public_router.delete('/{issue_id}/subscribers/me')
async def unsubscribe_issue(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _issue_row(db, issue_id, workspaceId, user['id'])
    await db.execute(
        text('DELETE FROM issue_subscriptions WHERE issue_id = :issue_id AND user_id = :user_id'),
        {'issue_id': issue_id, 'user_id': user['id']},
    )
    await db.commit()
    return {'data': {'ok': True}}


@router.post('/{issue_id}/favorite')
@public_router.post('/{issue_id}/favorite')
async def favorite_issue(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _issue_row(db, issue_id, workspaceId, user['id'])
    await db.execute(
        text('''INSERT INTO issue_favorites (issue_id, user_id) VALUES (:issue_id, :user_id)
                ON CONFLICT DO NOTHING'''),
        {'issue_id': issue_id, 'user_id': user['id']},
    )
    await db.commit()
    return {'data': {'issueId': issue_id, 'userId': user['id'], 'favorited': True}}


@router.delete('/{issue_id}/favorite')
@public_router.delete('/{issue_id}/favorite')
async def unfavorite_issue(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _issue_row(db, issue_id, workspaceId, user['id'])
    await db.execute(
        text('DELETE FROM issue_favorites WHERE issue_id = :issue_id AND user_id = :user_id'),
        {'issue_id': issue_id, 'user_id': user['id']},
    )
    await db.commit()
    return {'data': {'ok': True}}


async def _issue_reactions(db: AsyncSession, issue_id: str, user_id: str) -> list[dict[str, Any]]:
    result = await db.execute(
        text('''SELECT emoji, COUNT(*)::int AS count, BOOL_OR(user_id = :user_id) AS reacted
                FROM issue_reactions WHERE issue_id = :issue_id GROUP BY emoji ORDER BY MIN(created_at)'''),
        {'issue_id': issue_id, 'user_id': user_id},
    )
    return [{'emoji': row['emoji'], 'count': row['count'], 'reacted': row['reacted']} for row in result.mappings().all()]


@router.get('/{issue_id}/reactions')
@public_router.get('/{issue_id}/reactions')
async def issue_reactions(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _issue_row(db, issue_id, workspaceId, user['id'])
    return {'data': await _issue_reactions(db, issue_id, user['id'])}


@router.post('/{issue_id}/reactions/toggle')
@public_router.post('/{issue_id}/reactions/toggle')
async def toggle_issue_reaction(  # noqa: D401 - kept for existing API clients
    issue_id: str,
    payload: IssueReactionInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _issue_row(db, issue_id, payload.workspaceId, user['id'])
    emoji = payload.emoji.strip()
    deleted = await db.execute(
        text('''DELETE FROM issue_reactions WHERE issue_id = :issue_id AND user_id = :user_id
                AND emoji = :emoji RETURNING emoji'''),
        {'issue_id': issue_id, 'user_id': user['id'], 'emoji': emoji},
    )
    if deleted.scalar_one_or_none() is None:
        await db.execute(
            text('''INSERT INTO issue_reactions (issue_id, user_id, emoji)
                    VALUES (:issue_id, :user_id, :emoji)'''),
            {'issue_id': issue_id, 'user_id': user['id'], 'emoji': emoji},
        )
    await db.commit()
    return {'data': await _issue_reactions(db, issue_id, user['id'])}


@router.post('/{issue_id}/reactions/{emoji}')
@public_router.post('/{issue_id}/reactions/{emoji}')
async def add_issue_reaction(
    issue_id: str,
    emoji: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    """Add one emoji for the signed-in user; reacting twice is not an error."""

    await _issue_row(db, issue_id, workspaceId, user['id'])
    value = emoji.strip()
    if not value:
        raise ApiError(400, 'emoji must not be empty', 'Bad Request')
    await db.execute(
        text(
            '''INSERT INTO issue_reactions (issue_id, user_id, emoji)
               VALUES (:issue_id, :user_id, :emoji) ON CONFLICT DO NOTHING'''
        ),
        {'issue_id': issue_id, 'user_id': user['id'], 'emoji': value},
    )
    await db.commit()
    return {'data': await _issue_reactions(db, issue_id, user['id'])}


@router.delete('/{issue_id}/reactions/{emoji}')
@public_router.delete('/{issue_id}/reactions/{emoji}')
async def remove_issue_reaction(
    issue_id: str,
    emoji: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _issue_row(db, issue_id, workspaceId, user['id'])
    await db.execute(
        text(
            '''DELETE FROM issue_reactions WHERE issue_id = :issue_id
               AND user_id = :user_id AND emoji = :emoji'''
        ),
        {'issue_id': issue_id, 'user_id': user['id'], 'emoji': emoji.strip()},
    )
    await db.commit()
    return {'data': await _issue_reactions(db, issue_id, user['id'])}
