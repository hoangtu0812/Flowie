from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .native_projects import _date, _team_access, _workspace_access
from .teams import _manager


# Issues stay under a private prefix until their public response contract and
# Circle adapters have been verified. The legacy facade continues to serve the
# production UI during this phase.
router = APIRouter(prefix='/api/v1/_native/issues', tags=['native-issues'])

IssuePriority = Literal['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT']
IssueCategory = Literal['TRIAGE', 'BACKLOG', 'UNSTARTED', 'STARTED', 'COMPLETED', 'CANCELED']


class CreateIssueInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    teamId: str = Field(min_length=1)
    title: str = Field(min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    statusId: str | None = None
    projectId: str | None = None
    parentIssueId: str | None = None
    assigneeId: str | None = None
    priority: IssuePriority = 'NONE'
    dueDate: str | None = None
    labelIds: list[str] | None = Field(default=None, max_length=100)
    estimate: int | None = Field(default=None, ge=0)


class UpdateIssueInput(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=500)
    description: str | None = Field(default=None, max_length=10_000)
    statusId: str | None = None
    projectId: str | None = None
    assigneeId: str | None = None
    priority: IssuePriority | None = None
    dueDate: str | None = None
    labelIds: list[str] | None = Field(default=None, max_length=100)
    releaseIds: list[str] | None = Field(default=None, max_length=100)
    estimate: int | None = Field(default=None, ge=0)


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
    teamId: str = Field(min_length=1)


class ClassifyIssueInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    resolution: Literal['DUPLICATE', 'WONT_FIX']
    duplicateOfIdentifier: str | None = Field(default=None, max_length=100)


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


async def _issue_row(
    db: AsyncSession, issue_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    result = await db.execute(
        text(
            '''SELECT i.*, t.id AS team_id_value, t.name AS team_name,
                      t.identifier AS team_identifier, s.id AS status_id_value,
                      s.name AS status_name, s.category AS status_category, s.color AS status_color,
                      p.id AS project_id_value, p.name AS project_name, p.identifier AS project_identifier,
                      c.id AS creator_id_value, c.name AS creator_name, c.avatar_url AS creator_avatar_url,
                      a.id AS assignee_id_value, a.name AS assignee_name, a.avatar_url AS assignee_avatar_url,
                      EXISTS(SELECT 1 FROM issue_subscriptions sub WHERE sub.issue_id = i.id AND sub.user_id = :user_id) AS is_subscribed,
                      EXISTS(SELECT 1 FROM issue_favorites favorite WHERE favorite.issue_id = i.id AND favorite.user_id = :user_id) AS is_favorite
               FROM issues i
               JOIN teams t ON t.id = i.team_id
               JOIN issue_statuses s ON s.id = i.status_id
               LEFT JOIN projects p ON p.id = i.project_id
               JOIN users c ON c.id = i.creator_id
               LEFT JOIN users a ON a.id = i.assignee_id
               WHERE i.id = :issue_id AND i.workspace_id = :workspace_id AND i.archived_at IS NULL
               LIMIT 1'''
        ),
        {'issue_id': issue_id, 'workspace_id': workspace_id, 'user_id': user_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Issue not found.', 'Not Found')
    await _team_access(db, workspace_id, row['team_id'], user_id)

    labels = await db.execute(
        text(
            '''SELECT l.id, l.name, l.color FROM issue_labels il
               JOIN labels l ON l.id = il.label_id
               WHERE il.issue_id = :issue_id ORDER BY l.name'''
        ),
        {'issue_id': issue_id},
    )
    cycles = await db.execute(
        text('SELECT cycle_id, created_at FROM issue_cycles WHERE issue_id = :issue_id ORDER BY created_at'),
        {'issue_id': issue_id},
    )
    releases = await db.execute(
        text('SELECT release_id, created_at FROM issue_releases WHERE issue_id = :issue_id ORDER BY created_at'),
        {'issue_id': issue_id},
    )
    return {
        'id': row['id'],
        'workspaceId': row['workspace_id'],
        'teamId': row['team_id'],
        'statusId': row['status_id'],
        'projectId': row['project_id'],
        'parentIssueId': row['parent_issue_id'],
        'duplicateOfId': row['duplicate_of_id'],
        'identifier': row['identifier'],
        'number': row['number'],
        'title': row['title'],
        'description': row['description'],
        'priority': row['priority'],
        'resolution': row['resolution'],
        'estimate': row['estimate'],
        'dueDate': row['due_date'],
        'completedAt': row['completed_at'],
        'canceledAt': row['canceled_at'],
        'archivedAt': row['archived_at'],
        'createdAt': row['created_at'],
        'updatedAt': row['updated_at'],
        'team': {'id': row['team_id_value'], 'name': row['team_name'], 'identifier': row['team_identifier']},
        'status': {'id': row['status_id_value'], 'name': row['status_name'], 'category': row['status_category'], 'color': row['status_color']},
        'project': {'id': row['project_id_value'], 'name': row['project_name'], 'identifier': row['project_identifier']} if row['project_id_value'] else None,
        'creator': {'id': row['creator_id_value'], 'name': row['creator_name'], 'avatarUrl': row['creator_avatar_url']},
        'assignee': {'id': row['assignee_id_value'], 'name': row['assignee_name'], 'avatarUrl': row['assignee_avatar_url']} if row['assignee_id_value'] else None,
        'labelLinks': [{'label': {'id': label['id'], 'name': label['name'], 'color': label['color']}} for label in labels.mappings().all()],
        'cycleLinks': [{'cycleId': link['cycle_id'], 'createdAt': link['created_at']} for link in cycles.mappings().all()],
        'releaseLinks': [{'releaseId': link['release_id'], 'createdAt': link['created_at']} for link in releases.mappings().all()],
        'subscribers': [{'userId': user_id}] if row['is_subscribed'] else [],
        'favorites': [{'userId': user_id}] if row['is_favorite'] else [],
    }


async def _validate_references(
    db: AsyncSession,
    workspace_id: str,
    team_id: str,
    values: dict[str, Any],
    *,
    creating: bool,
) -> str | None:
    status_id = values.get('statusId')
    if status_id:
        status = await db.execute(
            text(
                '''SELECT id, category FROM issue_statuses
                   WHERE id = :status_id AND workspace_id = :workspace_id
                     AND (team_id IS NULL OR team_id = :team_id) LIMIT 1'''
            ),
            {'status_id': status_id, 'workspace_id': workspace_id, 'team_id': team_id},
        )
    elif creating:
        status = await db.execute(
            text(
                '''SELECT id, category FROM issue_statuses
                   WHERE workspace_id = :workspace_id AND category = 'UNSTARTED'
                     AND (team_id IS NULL OR team_id = :team_id)
                   ORDER BY position ASC LIMIT 1'''
            ),
            {'workspace_id': workspace_id, 'team_id': team_id},
        )
    else:
        return None
    row = status.mappings().first()
    if not row:
        raise ApiError(404, 'A valid issue status is required.', 'Not Found')
    values['statusId'] = row['id']

    project_id = values.get('projectId')
    if project_id:
        project = await db.execute(
            text(
                '''SELECT 1 FROM projects WHERE id = :project_id AND workspace_id = :workspace_id
                   AND archived_at IS NULL AND (team_id IS NULL OR team_id = :team_id)'''
            ),
            {'project_id': project_id, 'workspace_id': workspace_id, 'team_id': team_id},
        )
        if project.scalar_one_or_none() is None:
            raise ApiError(404, 'Project not found for this team.', 'Not Found')

    assignee_id = values.get('assigneeId')
    if assignee_id:
        assignee = await db.execute(
            text(
                '''SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id
                   AND user_id = :user_id AND status = 'ACTIVE' LIMIT 1'''
            ),
            {'workspace_id': workspace_id, 'user_id': assignee_id},
        )
        if assignee.scalar_one_or_none() is None:
            raise ApiError(404, 'Assignee is not a workspace member.', 'Not Found')

    label_ids = values.get('labelIds')
    if label_ids is not None:
        unique_ids = list(dict.fromkeys(label_ids))
        if unique_ids:
            labels = await db.execute(
                text('SELECT id FROM labels WHERE workspace_id = :workspace_id AND id = ANY(:label_ids)'),
                {'workspace_id': workspace_id, 'label_ids': unique_ids},
            )
            if len(labels.mappings().all()) != len(unique_ids):
                raise ApiError(404, 'One or more labels were not found.', 'Not Found')
        values['labelIds'] = unique_ids
    return row['category']


async def _validate_release_ids(
    db: AsyncSession, workspace_id: str, release_ids: list[str] | None
) -> list[str]:
    unique_ids = list(dict.fromkeys(release_ids or []))
    if not unique_ids:
        return unique_ids
    releases = await db.execute(
        text(
            '''SELECT id FROM releases WHERE workspace_id = :workspace_id
               AND archived_at IS NULL AND id = ANY(:release_ids)'''
        ),
        {'workspace_id': workspace_id, 'release_ids': unique_ids},
    )
    if len(releases.mappings().all()) != len(unique_ids):
        raise ApiError(404, 'One or more releases were not found.', 'Not Found')
    return unique_ids


async def _validate_template_references(
    db: AsyncSession, workspace_id: str, values: dict[str, Any]
) -> None:
    if values.get('statusId'):
        status = await db.execute(text('SELECT 1 FROM issue_statuses WHERE id = :id AND workspace_id = :workspace_id'), {'id': values['statusId'], 'workspace_id': workspace_id})
        if status.scalar_one_or_none() is None:
            raise ApiError(404, 'Issue status not found.', 'Not Found')
    if values.get('projectId'):
        project = await db.execute(text('SELECT 1 FROM projects WHERE id = :id AND workspace_id = :workspace_id AND archived_at IS NULL'), {'id': values['projectId'], 'workspace_id': workspace_id})
        if project.scalar_one_or_none() is None:
            raise ApiError(404, 'Project not found.', 'Not Found')
    if values.get('assigneeId'):
        member = await db.execute(text("SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :id AND status = 'ACTIVE'"), {'id': values['assigneeId'], 'workspace_id': workspace_id})
        if member.scalar_one_or_none() is None:
            raise ApiError(404, 'Assignee is not a workspace member.', 'Not Found')
    if 'labelIds' in values:
        label_ids = list(dict.fromkeys(values['labelIds'] or []))
        if label_ids:
            labels = await db.execute(text('SELECT id FROM labels WHERE workspace_id = :workspace_id AND id = ANY(:ids)'), {'workspace_id': workspace_id, 'ids': label_ids})
            if len(labels.mappings().all()) != len(label_ids):
                raise ApiError(404, 'One or more labels were not found.', 'Not Found')
        values['labelIds'] = label_ids


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


async def _write_activity(
    db: AsyncSession, workspace_id: str, issue_id: str, user_id: str, action: str, data: dict[str, Any]
) -> None:
    await db.execute(
        text(
            '''INSERT INTO activities (id, workspace_id, issue_id, actor_id, type, data, created_at)
               VALUES (:id, :workspace_id, :issue_id, :actor_id, :action, CAST(:data AS jsonb), :now)'''
        ),
        {
            'id': _cuid(),
            'workspace_id': workspace_id,
            'issue_id': issue_id,
            'actor_id': user_id,
            'action': action,
            'data': json.dumps(data),
            'now': _utcnow(),
        },
    )


def _relation_kind(relation_type: str, source_issue_id: str, perspective_issue_id: str) -> str:
    if relation_type == 'RELATED':
        return 'RELATED'
    return 'BLOCKS' if source_issue_id == perspective_issue_id else 'BLOCKED_BY'


async def _relation_summary(
    db: AsyncSession, issue_id: str, workspace_id: str, user_id: str
) -> dict[str, Any]:
    issue = await _issue_row(db, issue_id, workspace_id, user_id)
    return {
        'id': issue['id'],
        'identifier': issue['identifier'],
        'title': issue['title'],
        'status': issue['status'],
        'team': issue['team'],
    }


@router.get('')
async def list_issues(
    workspaceId: str = Query(min_length=1),
    teamId: str | None = None,
    categories: str | None = None,
    scope: Literal['assigned', 'created', 'subscribed', 'activity'] | None = None,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    params: dict[str, Any] = {'workspace_id': workspaceId, 'user_id': user['id']}
    if teamId:
        await _team_access(db, workspaceId, teamId, user['id'])
        team_clause = 'AND i.team_id = :team_id'
        params['team_id'] = teamId
    else:
        team_clause = 'AND EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id = i.team_id AND tm.user_id = :user_id)'
    scope_clauses = {
        'assigned': 'AND i.assignee_id = :user_id',
        'created': 'AND i.creator_id = :user_id',
        'subscribed': 'AND EXISTS(SELECT 1 FROM issue_subscriptions sub WHERE sub.issue_id = i.id AND sub.user_id = :user_id)',
        'activity': 'AND EXISTS(SELECT 1 FROM activities activity WHERE activity.issue_id = i.id AND activity.actor_id = :user_id)',
    }
    category_clause = ''
    allowed_categories = set(IssueCategory.__args__)
    requested_categories = [value for value in (categories or '').split(',') if value in allowed_categories]
    if requested_categories:
        category_clause = "AND s.category IN (" + ', '.join(f"'{value}'" for value in requested_categories) + ')'
    result = await db.execute(
        text(
            f'''SELECT i.id FROM issues i JOIN issue_statuses s ON s.id = i.status_id
                WHERE i.workspace_id = :workspace_id AND i.archived_at IS NULL
                {team_clause} {category_clause} {scope_clauses.get(scope, '')}
                ORDER BY i.updated_at DESC, i.created_at DESC'''
        ),
        params,
    )
    return {'data': [await _issue_row(db, row['id'], workspaceId, user['id']) for row in result.mappings().all()]}


@router.get('/options')
async def issue_options(
    workspaceId: str = Query(min_length=1),
    teamId: str | None = None,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, list[dict[str, Any]]]]:
    await _workspace_access(db, workspaceId, user['id'])
    if teamId:
        await _team_access(db, workspaceId, teamId, user['id'])
    team_filter = 'AND (team_id IS NULL OR team_id = :team_id)' if teamId else ''
    params = {'workspace_id': workspaceId, 'team_id': teamId}
    statuses, projects, members, labels, cycles = await db.execute(
        text(f'''SELECT id, name, category, color, position FROM issue_statuses WHERE workspace_id = :workspace_id {team_filter} ORDER BY position, name'''), params
    ), await db.execute(
        text(f'''SELECT id, name, identifier, status, priority, health, start_date, target_date, lead_id, team_id FROM projects WHERE workspace_id = :workspace_id AND archived_at IS NULL {team_filter} ORDER BY name'''), params
    ), await db.execute(
        text('''SELECT u.id, u.name, u.email, u.avatar_url FROM workspace_members wm JOIN users u ON u.id = wm.user_id WHERE wm.workspace_id = :workspace_id AND wm.status = 'ACTIVE' ORDER BY u.name'''), {'workspace_id': workspaceId}
    ), await db.execute(
        text('SELECT id, name, color FROM labels WHERE workspace_id = :workspace_id ORDER BY name'), {'workspace_id': workspaceId}
    ), await db.execute(
        text('''SELECT id, name, status, start_date, end_date FROM cycles WHERE workspace_id = :workspace_id ''' + ('AND team_id = :team_id ' if teamId else '') + 'ORDER BY start_date DESC NULLS LAST, created_at DESC'), params
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
        'members': [{'id': row['id'], 'name': row['name'], 'email': row['email'], 'avatarUrl': row['avatar_url']} for row in members.mappings().all()],
        'labels': [dict(row) for row in labels.mappings().all()],
        'cycles': [{'id': row['id'], 'name': row['name'], 'status': row['status'], 'startDate': row['start_date'], 'endDate': row['end_date']} for row in cycles.mappings().all()],
        'releases': [{'id': row['id'], 'name': row['name'], 'version': row['version'], 'status': row['status'], 'targetDate': row['target_date']} for row in releases.mappings().all()],
    }}


@router.post('')
async def create_issue(
    payload: CreateIssueInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user['id'])
    await _team_access(db, payload.workspaceId, payload.teamId, user['id'])
    values = payload.model_dump()
    category = await _validate_references(db, payload.workspaceId, payload.teamId, values, creating=True)
    if values.get('parentIssueId'):
        parent = await db.execute(
            text('''SELECT 1 FROM issues WHERE id = :issue_id AND workspace_id = :workspace_id
                    AND team_id = :team_id AND archived_at IS NULL'''),
            {'issue_id': values['parentIssueId'], 'workspace_id': payload.workspaceId, 'team_id': payload.teamId},
        )
        if parent.scalar_one_or_none() is None:
            raise ApiError(404, 'Parent issue was not found for this team.', 'Not Found')
    team = await db.execute(
        text('''UPDATE teams SET issue_sequence = issue_sequence + 1, updated_at = :now
                WHERE id = :team_id AND workspace_id = :workspace_id
                RETURNING identifier, issue_sequence'''),
        {'team_id': payload.teamId, 'workspace_id': payload.workspaceId, 'now': _utcnow()},
    )
    sequence = team.mappings().first()
    if not sequence:
        raise ApiError(404, 'Team not found.', 'Not Found')
    issue_id, now = _cuid(), _utcnow()
    completed_at = now if category == 'COMPLETED' else None
    canceled_at = now if category == 'CANCELED' else None
    await db.execute(
        text(
            '''INSERT INTO issues (id, workspace_id, team_id, status_id, project_id, parent_issue_id,
               identifier, number, title, description, priority, estimate, due_date, creator_id,
               assignee_id, completed_at, canceled_at, created_at, updated_at)
               VALUES (:id, :workspace_id, :team_id, :status_id, :project_id, :parent_issue_id,
               :identifier, :number, :title, :description, :priority, :estimate, :due_date, :creator_id,
               :assignee_id, :completed_at, :canceled_at, :now, :now)'''
        ),
        {
            'id': issue_id, 'workspace_id': payload.workspaceId, 'team_id': payload.teamId,
            'status_id': values['statusId'], 'project_id': values.get('projectId'),
            'parent_issue_id': values.get('parentIssueId'),
            'identifier': f"{sequence['identifier']}-{sequence['issue_sequence']}",
            'number': sequence['issue_sequence'], 'title': payload.title.strip(),
            'description': values.get('description'), 'priority': values['priority'],
            'estimate': values.get('estimate'), 'due_date': _date(values.get('dueDate')),
            'creator_id': user['id'], 'assignee_id': values.get('assigneeId'),
            'completed_at': completed_at, 'canceled_at': canceled_at, 'now': now,
        },
    )
    for label_id in values.get('labelIds') or []:
        await db.execute(text('INSERT INTO issue_labels (issue_id, label_id) VALUES (:issue_id, :label_id)'), {'issue_id': issue_id, 'label_id': label_id})
    for subscriber_id in {user['id'], values.get('assigneeId')} - {None}:
        await db.execute(text('INSERT INTO issue_subscriptions (issue_id, user_id) VALUES (:issue_id, :user_id) ON CONFLICT DO NOTHING'), {'issue_id': issue_id, 'user_id': subscriber_id})
    await _write_activity(db, payload.workspaceId, issue_id, user['id'], 'issue.created', {'title': payload.title.strip(), 'identifier': f"{sequence['identifier']}-{sequence['issue_sequence']}"})
    if values.get('parentIssueId'):
        await _write_activity(db, payload.workspaceId, values['parentIssueId'], user['id'], 'issue.subissue_created', {
            'issueId': issue_id,
            'identifier': f"{sequence['identifier']}-{sequence['issue_sequence']}",
            'title': payload.title.strip(),
        })
    await db.commit()
    return {'data': await _issue_row(db, issue_id, payload.workspaceId, user['id'])}


async def _template_row(db: AsyncSession, template_id: str, workspace_id: str) -> Any | None:
    result = await db.execute(
        text(
            '''SELECT template.*, creator.id AS creator_id, creator.name AS creator_name,
                      creator.avatar_url AS creator_avatar_url
               FROM issue_templates template
               JOIN users creator ON creator.id = template.created_by
               WHERE template.id = :template_id AND template.workspace_id = :workspace_id
               LIMIT 1'''
        ),
        {'template_id': template_id, 'workspace_id': workspace_id},
    )
    return result.mappings().first()


@router.get('/templates')
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


@router.get('/{issue_id}/sub-issues')
async def list_sub_issues(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    parent = await _issue_row(db, issue_id, workspaceId, user['id'])
    result = await db.execute(
        text(
            '''SELECT child.id, child.identifier, child.title,
                      status.id AS status_id, status.name AS status_name,
                      status.color AS status_color, status.category AS status_category,
                      assignee.id AS assignee_id, assignee.name AS assignee_name,
                      assignee.avatar_url AS assignee_avatar_url
               FROM issues child
               JOIN issue_statuses status ON status.id = child.status_id
               LEFT JOIN users assignee ON assignee.id = child.assignee_id
               WHERE child.workspace_id = :workspace_id AND child.team_id = :team_id
                 AND child.parent_issue_id = :parent_issue_id AND child.archived_at IS NULL
               ORDER BY child.updated_at DESC, child.created_at DESC'''
        ),
        {
            'workspace_id': workspaceId,
            'team_id': parent['teamId'],
            'parent_issue_id': parent['id'],
        },
    )
    return {'data': [
        {
            'id': row['id'],
            'identifier': row['identifier'],
            'title': row['title'],
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


async def _add_issue_relation(
    db: AsyncSession,
    issue_id: str,
    workspace_id: str,
    related_issue_id: str,
    relation_type: str,
    user_id: str,
) -> dict[str, Any]:
    issue = await _issue_row(db, issue_id, workspace_id, user_id)
    related = await _issue_row(db, related_issue_id, workspace_id, user_id)
    if issue['id'] == related['id']:
        raise ApiError(400, 'An issue cannot be related to itself.', 'Bad Request')

    source_issue_id, target_issue_id = (
        sorted((issue['id'], related['id']))
        if relation_type == 'RELATED'
        else (related['id'], issue['id'])
    )
    existing = await db.execute(
        text(
            '''SELECT issue_id, related_issue_id, type FROM issue_relations
               WHERE workspace_id = :workspace_id
                 AND ((issue_id = :issue_id AND related_issue_id = :related_issue_id)
                   OR (issue_id = :related_issue_id AND related_issue_id = :issue_id))
               LIMIT 1'''
        ),
        {
            'workspace_id': workspace_id,
            'issue_id': issue['id'],
            'related_issue_id': related['id'],
        },
    )
    previous = existing.mappings().first()
    if previous and (
        previous['type'] == relation_type
        and previous['issue_id'] == source_issue_id
        and previous['related_issue_id'] == target_issue_id
    ):
        return {
            'workspaceId': workspace_id,
            'issueId': previous['issue_id'],
            'relatedIssueId': previous['related_issue_id'],
            'type': previous['type'],
        }

    if previous:
        await db.execute(
            text(
                '''UPDATE issue_relations
                   SET issue_id = :source_issue_id, related_issue_id = :target_issue_id,
                       type = :relation_type, created_by = :user_id, created_at = :now
                   WHERE issue_id = :previous_issue_id AND related_issue_id = :previous_related_issue_id'''
            ),
            {
                'source_issue_id': source_issue_id,
                'target_issue_id': target_issue_id,
                'relation_type': relation_type,
                'user_id': user_id,
                'now': _utcnow(),
                'previous_issue_id': previous['issue_id'],
                'previous_related_issue_id': previous['related_issue_id'],
            },
        )
    else:
        await db.execute(
            text(
                '''INSERT INTO issue_relations
                   (workspace_id, issue_id, related_issue_id, type, created_at, created_by)
                   VALUES (:workspace_id, :issue_id, :related_issue_id, :relation_type, :now, :user_id)'''
            ),
            {
                'workspace_id': workspace_id,
                'issue_id': source_issue_id,
                'related_issue_id': target_issue_id,
                'relation_type': relation_type,
                'now': _utcnow(),
                'user_id': user_id,
            },
        )

    await _write_activity(db, workspace_id, issue['id'], user_id, 'issue.related', {
        'relatedIssueId': related['id'],
        'relatedIdentifier': related['identifier'],
        'relationType': relation_type,
        'relationKind': _relation_kind(relation_type, source_issue_id, issue['id']),
    })
    await _write_activity(db, workspace_id, related['id'], user_id, 'issue.related', {
        'relatedIssueId': issue['id'],
        'relatedIdentifier': issue['identifier'],
        'relationType': relation_type,
        'relationKind': _relation_kind(relation_type, source_issue_id, related['id']),
    })
    await db.commit()
    return {
        'workspaceId': workspace_id,
        'issueId': source_issue_id,
        'relatedIssueId': target_issue_id,
        'type': relation_type,
    }


@router.post('/{issue_id}/relations')
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
async def move_issue(
    issue_id: str,
    payload: MoveIssueInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    issue = await _issue_row(db, issue_id, payload.workspaceId, user['id'])
    if issue['teamId'] == payload.teamId:
        return {'data': issue}
    await _team_access(db, payload.workspaceId, payload.teamId, user['id'])
    destination = await db.execute(
        text(
            '''UPDATE teams SET issue_sequence = issue_sequence + 1, updated_at = :now
               WHERE id = :team_id AND workspace_id = :workspace_id AND archived_at IS NULL
               RETURNING id, name, identifier, issue_sequence'''
        ),
        {'team_id': payload.teamId, 'workspace_id': payload.workspaceId, 'now': _utcnow()},
    )
    team = destination.mappings().first()
    if not team:
        raise ApiError(404, 'Destination team not found.', 'Not Found')
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
            'identifier': f"{team['identifier']}-{team['issue_sequence']}",
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
        'identifier': f"{team['identifier']}-{team['issue_sequence']}",
    })
    await db.commit()
    return {'data': await _issue_row(db, issue_id, payload.workspaceId, user['id'])}


@router.post('/{issue_id}/classification')
async def classify_issue(
    issue_id: str,
    payload: ClassifyIssueInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
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
    await db.commit()
    return {'data': await _issue_row(db, issue_id, payload.workspaceId, user['id'])}


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
    issue = await _issue_row(db, issue_id, workspaceId, user['id'])
    values = payload.model_dump(exclude_unset=True)
    if 'statusId' in values and values['statusId'] is None:
        raise ApiError(400, 'statusId cannot be empty.', 'Bad Request')
    category = await _validate_references(db, workspaceId, issue['teamId'], values, creating=False)
    if 'releaseIds' in values:
        values['releaseIds'] = await _validate_release_ids(db, workspaceId, values['releaseIds'])
    columns = {
        'title': 'title', 'description': 'description', 'statusId': 'status_id', 'projectId': 'project_id',
        'assigneeId': 'assignee_id', 'priority': 'priority', 'estimate': 'estimate', 'dueDate': 'due_date',
    }
    sets, params = [], {'issue_id': issue_id, 'now': _utcnow()}
    for field, column in columns.items():
        if field in values:
            params[field] = _date(values[field]) if field == 'dueDate' else values[field]
            if field == 'title' and isinstance(params[field], str):
                params[field] = params[field].strip()
            sets.append(f'{column} = :{field}')
    if category:
        sets.extend(['completed_at = :completed_at', 'canceled_at = :canceled_at'])
        params['completed_at'] = _utcnow() if category == 'COMPLETED' else None
        params['canceled_at'] = _utcnow() if category == 'CANCELED' else None
    if sets:
        await db.execute(text(f"UPDATE issues SET {', '.join(sets)}, updated_at = :now WHERE id = :issue_id"), params)
    if 'labelIds' in values:
        await db.execute(text('DELETE FROM issue_labels WHERE issue_id = :issue_id'), {'issue_id': issue_id})
        for label_id in values['labelIds'] or []:
            await db.execute(text('INSERT INTO issue_labels (issue_id, label_id) VALUES (:issue_id, :label_id)'), {'issue_id': issue_id, 'label_id': label_id})
    if 'releaseIds' in values:
        await db.execute(text('DELETE FROM issue_releases WHERE issue_id = :issue_id'), {'issue_id': issue_id})
        for release_id in values['releaseIds']:
            await db.execute(
                text('INSERT INTO issue_releases (issue_id, release_id) VALUES (:issue_id, :release_id)'),
                {'issue_id': issue_id, 'release_id': release_id},
            )
    if values.get('assigneeId'):
        await db.execute(text('INSERT INTO issue_subscriptions (issue_id, user_id) VALUES (:issue_id, :user_id) ON CONFLICT DO NOTHING'), {'issue_id': issue_id, 'user_id': values['assigneeId']})
    await _write_activity(db, workspaceId, issue_id, user['id'], 'issue.updated', {'fields': list(values)})
    await db.commit()
    return {'data': await _issue_row(db, issue_id, workspaceId, user['id'])}


@router.delete('/{issue_id}')
async def archive_issue(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _issue_row(db, issue_id, workspaceId, user['id'])
    now = _utcnow()
    await db.execute(text('UPDATE issues SET archived_at = :now, updated_at = :now WHERE id = :issue_id AND workspace_id = :workspace_id'), {'issue_id': issue_id, 'workspace_id': workspaceId, 'now': now})
    await _write_activity(db, workspaceId, issue_id, user['id'], 'issue.archived', {})
    await db.commit()
    return {'data': {'id': issue_id, 'archivedAt': now}}


@router.post('/{issue_id}/subscribers/me')
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
async def issue_reactions(
    issue_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _issue_row(db, issue_id, workspaceId, user['id'])
    return {'data': await _issue_reactions(db, issue_id, user['id'])}


@router.post('/{issue_id}/reactions/toggle')
async def toggle_issue_reaction(
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
