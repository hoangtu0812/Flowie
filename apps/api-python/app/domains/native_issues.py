from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

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


async def _ensure_circle_issue_statuses(db: AsyncSession, workspace_id: str) -> None:
    """Bring pre-P6 workspaces onto the unchanged Circle workflow catalog."""
    now = _utcnow()
    for position, (name, category, color) in enumerate(DEFAULT_CIRCLE_ISSUE_STATUSES):
        existing = await db.execute(
            text(
                '''SELECT id FROM issue_statuses
                   WHERE workspace_id = :workspace_id AND team_id IS NULL
                     AND lower(name) = lower(:name)
                   ORDER BY created_at ASC LIMIT 1'''
            ),
            {'workspace_id': workspace_id, 'name': name},
        )
        status_id = existing.scalar_one_or_none()
        if status_id:
            await db.execute(
                text(
                    '''UPDATE issue_statuses
                       SET name = :name, category = :category, color = :color,
                           position = :position, updated_at = :now
                       WHERE id = :id'''
                ),
                {
                    'id': status_id,
                    'name': name,
                    'category': category,
                    'color': color,
                    'position': position,
                    'now': now,
                },
            )
            continue
        await db.execute(
            text(
                '''INSERT INTO issue_statuses
                   (id, workspace_id, name, category, color, position, created_at, updated_at)
                   VALUES (:id, :workspace_id, :name, :category, :color, :position, :now, :now)'''
            ),
            {
                'id': _cuid(),
                'workspace_id': workspace_id,
                'name': name,
                'category': category,
                'color': color,
                'position': position,
                'now': now,
            },
        )


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
                      EXISTS(SELECT 1 FROM issue_favorites favorite WHERE favorite.issue_id = i.id AND favorite.user_id = :user_id) AS is_favorite,
                      (SELECT remind_at FROM issue_reminders reminder
                       WHERE reminder.issue_id = i.id AND reminder.user_id = :user_id AND reminder.delivered_at IS NULL
                       ORDER BY reminder.updated_at DESC LIMIT 1) AS reminder_at
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
        'reminderAt': row['reminder_at'],
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
                WHERE i.workspace_id = :workspace_id AND i.archived_at IS NULL AND i.parent_issue_id IS NULL
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
    await _ensure_circle_issue_statuses(db, workspaceId)
    await db.commit()
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
        text('''SELECT id, team_id, name, status, start_date, end_date FROM cycles WHERE workspace_id = :workspace_id ''' + ('AND team_id = :team_id ' if teamId else '') + 'ORDER BY start_date DESC NULLS LAST, created_at DESC'), params
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
        'cycles': [{'id': row['id'], 'teamId': row['team_id'], 'name': row['name'], 'status': row['status'], 'startDate': row['start_date'], 'endDate': row['end_date']} for row in cycles.mappings().all()],
        'releases': [{'id': row['id'], 'name': row['name'], 'version': row['version'], 'status': row['status'], 'targetDate': row['target_date']} for row in releases.mappings().all()],
    }}


# Public read contract: this is intentionally limited to the data already
# consumed by the Circle list adapter. Every other Issue route stays on the
# legacy facade or under /_native until it has comparable contract coverage.
@public_router.get('')
async def public_list_issues(
    workspaceId: str = Query(min_length=1),
    teamId: str | None = None,
    categories: str | None = None,
    scope: Literal['assigned', 'created', 'subscribed', 'activity'] | None = None,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    return await list_issues(workspaceId, teamId, categories, scope, user, db)


@public_router.get('/options')
async def public_issue_options(
    workspaceId: str = Query(min_length=1),
    teamId: str | None = None,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, list[dict[str, Any]]]]:
    return await issue_options(workspaceId, teamId, user, db)


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
    if not values.get('dueDate'):
        values['dueDate'] = await resolve_deadline(db, payload.workspaceId, payload.teamId, values['priority'])
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
    created_details = [
        ('Team', sequence['identifier']),
        ('Status', await _status_name(db, values['statusId']) or ''),
        ('Priority', (values.get('priority') or 'NONE').title()),
    ]
    assignee_name = await _person_name(db, values.get('assigneeId'))
    if assignee_name:
        created_details.append(('Assignee', assignee_name))
    created_batch = await create_notification_batch(
        db,
        workspace_id=payload.workspaceId,
        recipient_ids=await team_recipient_ids(db, payload.teamId),
        actor=user,
        event_type='issue.created',
        entity_type='issue',
        entity_id=issue_id,
        title=payload.title.strip(),
        message='created a new issue',
        entity_path=f"/issue/{sequence['identifier']}-{sequence['issue_sequence']}",
        entity_label=f"{sequence['identifier']}-{sequence['issue_sequence']}",
        details=created_details,
        body=values.get('description'),
    )
    assignment_batch = await create_notification_batch(
        db,
        workspace_id=payload.workspaceId,
        recipient_ids={values['assigneeId']} if values.get('assigneeId') else set(),
        actor=user,
        event_type='issue.assignment',
        entity_type='issue',
        entity_id=issue_id,
        title=payload.title.strip(),
        message='assigned you to an issue',
        entity_path=f"/issue/{sequence['identifier']}-{sequence['issue_sequence']}",
        entity_label=f"{sequence['identifier']}-{sequence['issue_sequence']}",
        discord=False,
    )
    await db.commit()
    await publish_notification_batches(created_batch, assignment_batch)
    return {'data': await _issue_row(db, issue_id, payload.workspaceId, user['id'])}


@public_router.post('')
async def public_create_issue(
    payload: CreateIssueInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    """Audited create contract for the untouched Circle Create Issue dialog."""
    return await create_issue(payload, user, db)


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


@router.get('/{issue_id}/sub-issues')
@public_router.get('/{issue_id}/sub-issues')
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
@public_router.post('/{issue_id}/classification')
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


@router.post('/{issue_id}/convert-to-comment')
@public_router.post('/{issue_id}/convert-to-comment')
async def convert_issue_to_comment(
    issue_id: str,
    payload: ConvertIssueToCommentInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
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


async def _status_name(db: AsyncSession, status_id: str | None) -> str | None:
    if not status_id:
        return None
    result = await db.execute(text('SELECT name FROM issue_statuses WHERE id = :id'), {'id': status_id})
    return result.scalar_one_or_none()


async def _person_name(db: AsyncSession, user_id: str | None) -> str | None:
    if not user_id:
        return None
    result = await db.execute(text('SELECT name FROM users WHERE id = :id'), {'id': user_id})
    return result.scalar_one_or_none()


async def _project_name(db: AsyncSession, project_id: str | None) -> str | None:
    if not project_id:
        return None
    result = await db.execute(text('SELECT name FROM projects WHERE id = :id'), {'id': project_id})
    return result.scalar_one_or_none()


def _transition(before: Any, after: Any) -> str:
    """Render a change as ``Todo → In Progress``.

    The pair is the point: the new value on its own does not say what happened.
    """

    return f'{before or "—"} → {after or "—"}'


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
    previous_status_id = issue['statusId']
    previous_assignee_id = issue['assignee']['id'] if issue.get('assignee') else None
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
    recipients = await issue_recipient_ids(db, issue_id, previous_assignee_id)
    entity_path, entity_label = f"/issue/{issue['identifier']}", issue['identifier']
    status_changed = bool(values.get('statusId')) and values['statusId'] != previous_status_id
    assignee_changed = 'assigneeId' in values and values['assigneeId'] != previous_assignee_id
    assignee_transition = (
        _transition(
            issue['assignee']['name'] if issue.get('assignee') else None,
            await _person_name(db, values.get('assigneeId')),
        )
        if assignee_changed
        else None
    )

    # What actually moved, so a reader sees the change and not just the field
    # name. One save produces one notification: a status change carries the
    # rest of the edit with it.
    changes: list[tuple[str, str]] = []
    if status_changed:
        changes.append(
            ('Status', _transition(issue['status']['name'], await _status_name(db, values['statusId'])))
        )
    if assignee_transition:
        changes.append(('Assignee', assignee_transition))
    if 'title' in values and values['title'] != issue['title']:
        changes.append(('Title', _transition(issue['title'], values['title'])))
    if 'priority' in values and values['priority'] != issue['priority']:
        changes.append(('Priority', _transition(issue['priority'], values['priority'])))
    if 'projectId' in values and values['projectId'] != issue['projectId']:
        changes.append(
            (
                'Project',
                _transition(
                    issue['project']['name'] if issue.get('project') else None,
                    await _project_name(db, values['projectId']),
                ),
            )
        )
    if 'dueDate' in values:
        before = issue['dueDate'].date().isoformat() if issue.get('dueDate') else None
        after = _date(values['dueDate'])
        after_text = after.date().isoformat() if after else None
        if before != after_text:
            changes.append(('Due date', _transition(before, after_text)))
    if 'estimate' in values and values['estimate'] != issue['estimate']:
        changes.append(('Estimate', _transition(issue['estimate'], values['estimate'])))
    if 'description' in values and values['description'] != issue['description']:
        changes.append(('Description', 'updated'))

    # An event is only reported when it happened: the batch used to be built
    # regardless and still reached Discord, so renaming an issue announced a
    # status change that never took place.
    change_batch = (
        await create_notification_batch(
            db,
            workspace_id=workspaceId,
            recipient_ids=recipients,
            actor=user,
            event_type='issue.status_changed' if status_changed else 'issue.updated',
            entity_type='issue',
            entity_id=issue_id,
            title=issue['title'],
            message='changed the status of an issue' if status_changed else 'updated an issue',
            entity_path=entity_path,
            entity_label=entity_label,
            details=changes,
        )
        if changes
        else None
    )
    assignment_batch = (
        await create_notification_batch(
            db,
            workspace_id=workspaceId,
            recipient_ids={values['assigneeId']} if values.get('assigneeId') else set(),
            actor=user,
            event_type='issue.assignment',
            entity_type='issue',
            entity_id=issue_id,
            title=issue['title'],
            message='assigned you to an issue',
            entity_path=entity_path,
            entity_label=entity_label,
            details=[('Assignee', assignee_transition or '')],
            discord=False,
        )
        if assignee_changed and values.get('assigneeId')
        else None
    )
    await db.commit()
    await publish_notification_batches(change_batch, assignment_batch)
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
) -> dict[str, dict[str, Any]]:
    return await archive_issue(f'c{issue_suffix}', workspaceId, user, db)


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
