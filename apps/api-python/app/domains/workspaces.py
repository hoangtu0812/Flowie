from __future__ import annotations

import json
from typing import Any, Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _normalized_email, _utcnow, create_workspace_bootstrap, current_user

router = APIRouter(prefix='/api/v1/workspaces', tags=['workspaces'])

USER_SELECT = '''
    u.id AS user_id_value, u.email AS user_email, u.name AS user_name,
    u.username AS user_username, u.title AS user_title, u.timezone AS user_timezone,
    u.avatar_url AS user_avatar_url, u.is_platform_admin AS user_is_platform_admin,
    u.email_verified_at AS user_email_verified_at, u.status AS user_status,
    u.created_at AS user_created_at, u.updated_at AS user_updated_at,
    u.last_login_at AS user_last_login_at
'''


class CreateWorkspaceInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class InviteMemberInput(BaseModel):
    email: str = Field(max_length=320)
    role: str | None = Field(default=None, max_length=16)


class UpdateMemberInput(BaseModel):
    role: str = Field(max_length=16)


class ProjectViewTypes(BaseModel):
    all: Literal['list', 'board', 'timeline']
    active: Literal['list', 'board', 'timeline']


class ProjectDisplayProperties(BaseModel):
    milestones: bool
    priority: bool
    status: bool
    health: bool
    lead: bool
    members: bool
    targetDate: bool
    issues: bool
    labels: bool


class ProjectDisplayDefaultsInput(BaseModel):
    viewTypes: ProjectViewTypes
    grouping: Literal['team', 'none']
    ordering: Literal['start-date', 'target-date', 'title']
    closedProjects: Literal['all', 'hide']
    showEmptyGroups: bool
    showProjectList: bool
    showWeekNumbers: bool
    displayProperties: ProjectDisplayProperties


class IssueDisplayProperties(BaseModel):
    id: bool
    status: bool
    priority: bool
    assignee: bool
    labels: bool
    project: bool
    dueDate: bool
    created: bool
    cycle: bool


class IssueDisplayDefaultsInput(BaseModel):
    viewType: Literal['list', 'grid']
    grouping: Literal['status', 'assignee', 'priority', 'project', 'none']
    ordering: Literal['priority', 'created', 'title']
    orderCompletedByRecency: bool
    completedIssues: Literal['all', 'none']
    showSubIssues: bool
    showEmptyGroups: bool
    displayProperties: IssueDisplayProperties


class IssueInsightDefaultsInput(BaseModel):
    measure: Literal['issue-count']
    slice: Literal['status']
    segment: Literal['priority']


DEFAULT_PROJECT_DISPLAY_SETTINGS = {
    'viewTypes': {'all': 'list', 'active': 'timeline'},
    'grouping': 'team',
    'ordering': 'start-date',
    'closedProjects': 'all',
    'showEmptyGroups': False,
    'showProjectList': True,
    'showWeekNumbers': False,
    'displayProperties': {
        'milestones': False,
        'priority': True,
        'status': True,
        'health': True,
        'lead': True,
        'members': False,
        'targetDate': True,
        'issues': True,
        'labels': False,
    },
}

DEFAULT_ISSUE_DISPLAY_SETTINGS = {
    'viewType': 'list',
    'grouping': 'status',
    'ordering': 'priority',
    'orderCompletedByRecency': False,
    'completedIssues': 'all',
    'showSubIssues': True,
    'showEmptyGroups': False,
    'displayProperties': {
        'id': True,
        'status': True,
        'priority': True,
        'assignee': True,
        'labels': True,
        'project': True,
        'dueDate': False,
        'created': True,
        'cycle': False,
    },
}

DEFAULT_ISSUE_INSIGHT_SETTINGS = {'measure': 'issue-count', 'slice': 'status', 'segment': 'priority'}


def _name(value: str) -> str:
    normalized = value.strip()
    if not 2 <= len(normalized) <= 120:
        raise ApiError(400, 'name must be longer than or equal to 2 characters', 'Bad Request')
    return normalized


def _role(value: str | None, *, invite: bool) -> str:
    role = (value or 'MEMBER').upper()
    if role not in {'OWNER', 'ADMIN', 'MEMBER'}:
        raise ApiError(400, 'role must be a valid enum value', 'Bad Request')
    return 'MEMBER' if invite and role == 'OWNER' else role


def _user(row: Any) -> dict[str, Any]:
    return {
        'id': row['user_id_value'],
        'email': row['user_email'],
        'name': row['user_name'],
        'username': row['user_username'],
        'title': row['user_title'],
        'timezone': row['user_timezone'],
        'avatarUrl': row['user_avatar_url'],
        'isPlatformAdmin': row['user_is_platform_admin'],
        'emailVerifiedAt': row['user_email_verified_at'],
        'status': row['user_status'],
        'createdAt': row['user_created_at'],
        'updatedAt': row['user_updated_at'],
        'lastLoginAt': row['user_last_login_at'],
    }


def _member(row: Any, *, include_user: bool = True) -> dict[str, Any]:
    record: dict[str, Any] = {
        'id': row['member_id'],
        'workspaceId': row['workspace_id'],
        'userId': row['member_user_id'],
        'status': row['member_status'],
        'role': row['member_role'],
        'joinedAt': row['member_joined_at'],
        'invitedById': row['member_invited_by'],
        'createdAt': row['member_created_at'],
        'updatedAt': row['member_updated_at'],
    }
    if include_user:
        record['user'] = _user(row)
    return record


async def _member_row(db: AsyncSession, workspace_id: str, user_id: str) -> Any | None:
    result = await db.execute(
        text(
            f'''
            SELECT wm.id AS member_id, wm.workspace_id, wm.user_id AS member_user_id,
                   wm.status AS member_status, wm.role AS member_role,
                   wm.joined_at AS member_joined_at, wm.invited_by AS member_invited_by,
                   wm.created_at AS member_created_at, wm.updated_at AS member_updated_at,
                   {USER_SELECT}
            FROM workspace_members AS wm
            INNER JOIN users AS u ON u.id = wm.user_id
            WHERE wm.workspace_id = :workspace_id AND wm.user_id = :user_id
            LIMIT 1
            '''
        ),
        {'workspace_id': workspace_id, 'user_id': user_id},
    )
    return result.mappings().first()


async def _authorize_member(db: AsyncSession, workspace_id: str, user_id: str) -> Any:
    membership = await _member_row(db, workspace_id, user_id)
    if not membership or membership['member_status'] != 'ACTIVE':
        raise ApiError(404, 'Workspace not found.', 'Not Found')
    return membership


async def _authorize_manager(db: AsyncSession, workspace_id: str, user_id: str) -> Any:
    membership = await _member_row(db, workspace_id, user_id)
    if not membership or membership['member_status'] != 'ACTIVE' or membership['member_role'] not in {'OWNER', 'ADMIN'}:
        raise ApiError(403, 'Workspace administrator access is required.', 'Forbidden')
    return membership


async def _authorize_owner(db: AsyncSession, workspace_id: str, user_id: str) -> Any:
    membership = await _member_row(db, workspace_id, user_id)
    if not membership or membership['member_status'] != 'ACTIVE' or membership['member_role'] != 'OWNER':
        raise ApiError(403, 'Workspace owner access is required.', 'Forbidden')
    return membership


def _workspace(row: Any) -> dict[str, Any]:
    return {
        'id': row['workspace_id_value'],
        'organizationId': row['organization_id'],
        'name': row['workspace_name'],
        'slug': row['workspace_slug'],
        'description': row['workspace_description'],
        'timezone': row['workspace_timezone'],
        'projectDisplayDefaults': row['project_display_defaults'],
        'issueDisplayDefaults': row['issue_display_defaults'],
        'issueInsightDefaults': row['issue_insight_defaults'],
        'createdAt': row['workspace_created_at'],
        'updatedAt': row['workspace_updated_at'],
        'organization': {
            'id': row['organization_id_value'],
            'name': row['organization_name'],
            'slug': row['organization_slug'],
            'logoUrl': row['organization_logo_url'],
            'ownerId': row['organization_owner_id'],
            'createdAt': row['organization_created_at'],
            'updatedAt': row['organization_updated_at'],
        },
    }


async def _workspace_summary(db: AsyncSession, workspace_id: str) -> dict[str, Any] | None:
    result = await db.execute(
        text(
            '''
            SELECT w.id AS workspace_id_value, w.organization_id, w.name AS workspace_name,
                   w.slug AS workspace_slug, w.description AS workspace_description,
                   w.timezone AS workspace_timezone, w.project_display_defaults,
                   w.issue_display_defaults, w.issue_insight_defaults,
                   w.created_at AS workspace_created_at, w.updated_at AS workspace_updated_at,
                   o.id AS organization_id_value, o.name AS organization_name,
                   o.slug AS organization_slug, o.logo_url AS organization_logo_url,
                   o.owner_id AS organization_owner_id, o.created_at AS organization_created_at,
                   o.updated_at AS organization_updated_at
            FROM workspaces AS w
            INNER JOIN organizations AS o ON o.id = w.organization_id
            WHERE w.id = :workspace_id
            LIMIT 1
            '''
        ),
        {'workspace_id': workspace_id},
    )
    row = result.mappings().first()
    return _workspace(row) if row else None


async def _created_organization(db: AsyncSession, workspace_id: str) -> dict[str, Any]:
    workspace = await _workspace_summary(db, workspace_id)
    if not workspace:
        raise ApiError(404, 'Workspace not found.', 'Not Found')
    owner = await _member_row(db, workspace_id, workspace['organization']['ownerId'])
    if not owner:
        raise ApiError(404, 'Workspace owner not found.', 'Not Found')
    organization = workspace['organization']
    workspace_record = {key: value for key, value in workspace.items() if key != 'organization'}
    workspace_record['members'] = [_member(owner)]
    return {**organization, 'workspaces': [workspace_record]}


async def _read_display_preferences(
    db: AsyncSession,
    *,
    workspace_id: str,
    user_id: str,
    column: str,
    default: dict[str, Any],
) -> dict[str, Any]:
    await _authorize_member(db, workspace_id, user_id)
    result = await db.execute(
        text(f'SELECT {column} AS settings, updated_at FROM workspaces WHERE id = :workspace_id'),
        {'workspace_id': workspace_id},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Workspace not found.', 'Not Found')
    return {'settings': row['settings'] or default, 'updatedAt': row['updated_at']}


async def _write_display_preferences(
    db: AsyncSession,
    *,
    workspace_id: str,
    user_id: str,
    column: str,
    settings: dict[str, Any],
    audit_action: str,
) -> dict[str, Any]:
    await _authorize_manager(db, workspace_id, user_id)
    now = _utcnow()
    result = await db.execute(
        text(
            f'''
            UPDATE workspaces
            SET {column} = CAST(:settings AS jsonb), updated_at = :now
            WHERE id = :workspace_id
            RETURNING {column} AS settings, updated_at
            '''
        ),
        {'workspace_id': workspace_id, 'settings': json.dumps(settings), 'now': now},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Workspace not found.', 'Not Found')
    await db.execute(
        text(
            '''
            INSERT INTO audit_logs (
                id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at
            ) VALUES (
                :id, :workspace_id, :actor_id, :action, 'workspace', :entity_id,
                CAST('{}' AS jsonb), :now
            )
            '''
        ),
        {
            'id': _cuid(),
            'workspace_id': workspace_id,
            'actor_id': user_id,
            'action': audit_action,
            'entity_id': workspace_id,
            'now': now,
        },
    )
    await db.commit()
    return {'settings': row['settings'], 'updatedAt': row['updated_at']}


@router.get('/me')
async def mine(
    user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)
) -> dict[str, list[dict[str, Any]]]:
    result = await db.execute(
        text(
            '''
            SELECT wm.id AS member_id, wm.workspace_id, wm.user_id AS member_user_id,
                   wm.status AS member_status, wm.role AS member_role,
                   wm.joined_at AS member_joined_at, wm.invited_by AS member_invited_by,
                   wm.created_at AS member_created_at, wm.updated_at AS member_updated_at,
                   w.id AS workspace_id_value, w.organization_id, w.name AS workspace_name,
                   w.slug AS workspace_slug, w.description AS workspace_description,
                   w.timezone AS workspace_timezone, w.project_display_defaults,
                   w.issue_display_defaults, w.issue_insight_defaults,
                   w.created_at AS workspace_created_at, w.updated_at AS workspace_updated_at,
                   o.id AS organization_id_value, o.name AS organization_name,
                   o.slug AS organization_slug, o.logo_url AS organization_logo_url,
                   o.owner_id AS organization_owner_id, o.created_at AS organization_created_at,
                   o.updated_at AS organization_updated_at
            FROM workspace_members AS wm
            INNER JOIN workspaces AS w ON w.id = wm.workspace_id
            INNER JOIN organizations AS o ON o.id = w.organization_id
            WHERE wm.user_id = :user_id AND wm.status = 'ACTIVE'
            ORDER BY wm.created_at ASC
            '''
        ),
        {'user_id': user['id']},
    )
    memberships = []
    for row in result.mappings().all():
        membership = _member(row, include_user=False)
        membership['workspace'] = _workspace(row)
        memberships.append(membership)
    return {'data': memberships}


@router.get('/invitations')
async def pending_invitations(
    user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)
) -> dict[str, list[dict[str, Any]]]:
    result = await db.execute(
        text(
            '''
            SELECT wm.id AS member_id, wm.workspace_id, wm.user_id AS member_user_id,
                   wm.status AS member_status, wm.role AS member_role,
                   wm.joined_at AS member_joined_at, wm.invited_by AS member_invited_by,
                   wm.created_at AS member_created_at, wm.updated_at AS member_updated_at,
                   w.id AS workspace_id_value, w.organization_id, w.name AS workspace_name,
                   w.slug AS workspace_slug, w.description AS workspace_description,
                   w.timezone AS workspace_timezone, w.project_display_defaults,
                   w.issue_display_defaults, w.issue_insight_defaults,
                   w.created_at AS workspace_created_at, w.updated_at AS workspace_updated_at,
                   o.id AS organization_id_value, o.name AS organization_name,
                   o.slug AS organization_slug, o.logo_url AS organization_logo_url,
                   o.owner_id AS organization_owner_id, o.created_at AS organization_created_at,
                   o.updated_at AS organization_updated_at,
                   inviter.id AS inviter_id, inviter.name AS inviter_name, inviter.email AS inviter_email
            FROM workspace_members AS wm
            INNER JOIN workspaces AS w ON w.id = wm.workspace_id
            INNER JOIN organizations AS o ON o.id = w.organization_id
            LEFT JOIN users AS inviter ON inviter.id = wm.invited_by
            WHERE wm.user_id = :user_id AND wm.status = 'INVITED'
            ORDER BY wm.created_at DESC
            '''
        ),
        {'user_id': user['id']},
    )
    invitations = []
    for row in result.mappings().all():
        invitation = _member(row, include_user=False)
        invitation['workspace'] = _workspace(row)
        invitation['invitedBy'] = (
            {'id': row['inviter_id'], 'name': row['inviter_name'], 'email': row['inviter_email']}
            if row['inviter_id']
            else None
        )
        invitations.append(invitation)
    return {'data': invitations}


@router.post('')
async def create_workspace(
    payload: CreateWorkspaceInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    name = _name(payload.name)
    try:
        # `current_user` has already performed a read on this shared session,
        # so use that transaction and commit the complete bootstrap once.
        bootstrap = await create_workspace_bootstrap(
            db,
            user_id=user['id'],
            organization_name=name,
            workspace_name=name,
            now=_utcnow(),
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A workspace with this name already exists.', 'Conflict') from error
    return {'data': await _created_organization(db, bootstrap['workspace_id'])}


@router.get('/{workspace_id}/project-display-defaults')
async def project_display_defaults(
    workspace_id: str,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    return {
        'data': await _read_display_preferences(
            db,
            workspace_id=workspace_id,
            user_id=user['id'],
            column='project_display_defaults',
            default=DEFAULT_PROJECT_DISPLAY_SETTINGS,
        )
    }


@router.patch('/{workspace_id}/project-display-defaults')
async def update_project_display_defaults(
    workspace_id: str,
    payload: ProjectDisplayDefaultsInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    return {
        'data': await _write_display_preferences(
            db,
            workspace_id=workspace_id,
            user_id=user['id'],
            column='project_display_defaults',
            settings=payload.model_dump(),
            audit_action='workspace.project-display-defaults.updated',
        )
    }


@router.get('/{workspace_id}/issue-display-defaults')
async def issue_display_defaults(
    workspace_id: str,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    return {
        'data': await _read_display_preferences(
            db,
            workspace_id=workspace_id,
            user_id=user['id'],
            column='issue_display_defaults',
            default=DEFAULT_ISSUE_DISPLAY_SETTINGS,
        )
    }


@router.patch('/{workspace_id}/issue-display-defaults')
async def update_issue_display_defaults(
    workspace_id: str,
    payload: IssueDisplayDefaultsInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    return {
        'data': await _write_display_preferences(
            db,
            workspace_id=workspace_id,
            user_id=user['id'],
            column='issue_display_defaults',
            settings=payload.model_dump(),
            audit_action='workspace.issue-display-defaults.updated',
        )
    }


@router.get('/{workspace_id}/issue-insight-defaults')
async def issue_insight_defaults(
    workspace_id: str,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    return {
        'data': await _read_display_preferences(
            db,
            workspace_id=workspace_id,
            user_id=user['id'],
            column='issue_insight_defaults',
            default=DEFAULT_ISSUE_INSIGHT_SETTINGS,
        )
    }


@router.patch('/{workspace_id}/issue-insight-defaults')
async def update_issue_insight_defaults(
    workspace_id: str,
    payload: IssueInsightDefaultsInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    return {
        'data': await _write_display_preferences(
            db,
            workspace_id=workspace_id,
            user_id=user['id'],
            column='issue_insight_defaults',
            settings=payload.model_dump(),
            audit_action='workspace.issue-insight-defaults.updated',
        )
    }


@router.get('/{workspace_id}/members')
async def members(
    workspace_id: str,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, list[dict[str, Any]]]:
    await _authorize_member(db, workspace_id, user['id'])
    result = await db.execute(
        text(
            f'''
            SELECT wm.id AS member_id, wm.workspace_id, wm.user_id AS member_user_id,
                   wm.status AS member_status, wm.role AS member_role,
                   wm.joined_at AS member_joined_at, wm.invited_by AS member_invited_by,
                   wm.created_at AS member_created_at, wm.updated_at AS member_updated_at,
                   {USER_SELECT}
            FROM workspace_members AS wm
            INNER JOIN users AS u ON u.id = wm.user_id
            WHERE wm.workspace_id = :workspace_id
            ORDER BY wm.created_at ASC
            '''
        ),
        {'workspace_id': workspace_id},
    )
    return {'data': [_member(row) for row in result.mappings().all()]}


@router.post('/{workspace_id}/invitations')
async def invite(
    workspace_id: str,
    payload: InviteMemberInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _authorize_manager(db, workspace_id, user['id'])
    email = _normalized_email(payload.email)
    role = _role(payload.role, invite=True)
    result = await db.execute(text('SELECT id FROM users WHERE email = :email LIMIT 1'), {'email': email})
    invited_id = result.scalar_one_or_none()
    if not invited_id:
        raise ApiError(404, 'This person needs to register a Flowie account before they can be invited.', 'Not Found')
    if invited_id == user['id']:
        raise ApiError(409, 'You are already in this workspace.', 'Conflict')
    existing = await _member_row(db, workspace_id, invited_id)
    if existing and existing['member_status'] == 'ACTIVE':
        raise ApiError(409, 'This person is already a workspace member.', 'Conflict')
    now = _utcnow()
    if existing:
        await db.execute(text("UPDATE workspace_members SET status = 'INVITED', role = :role, invited_by = :invited_by, joined_at = NULL, updated_at = :now WHERE id = :id"), {'id': existing['member_id'], 'role': role, 'invited_by': user['id'], 'now': now})
    else:
        await db.execute(text("INSERT INTO workspace_members (id, workspace_id, user_id, status, role, invited_by, created_at, updated_at) VALUES (:id, :workspace_id, :user_id, 'INVITED', :role, :invited_by, :now, :now)"), {'id': _cuid(), 'workspace_id': workspace_id, 'user_id': invited_id, 'role': role, 'invited_by': user['id'], 'now': now})
    await db.commit()
    invited = await _member_row(db, workspace_id, invited_id)
    return {'data': _member(invited)}


@router.post('/invitations/{member_id}/accept')
async def accept_invitation(
    member_id: str,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    result = await db.execute(text("SELECT workspace_id FROM workspace_members WHERE id = :id AND user_id = :user_id AND status = 'INVITED' LIMIT 1"), {'id': member_id, 'user_id': user['id']})
    workspace_id = result.scalar_one_or_none()
    if not workspace_id:
        raise ApiError(404, 'Invitation not found.', 'Not Found')
    await db.execute(text("UPDATE workspace_members SET status = 'ACTIVE', joined_at = :now, updated_at = :now WHERE id = :id"), {'id': member_id, 'now': _utcnow()})
    await db.commit()
    member = await _member_row(db, workspace_id, user['id'])
    record = _member(member, include_user=False)
    record['workspace'] = await _workspace_summary(db, workspace_id)
    return {'data': record}


@router.delete('/invitations/{member_id}')
async def decline_invitation(
    member_id: str,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    result = await db.execute(text("DELETE FROM workspace_members WHERE id = :id AND user_id = :user_id AND status = 'INVITED' RETURNING id"), {'id': member_id, 'user_id': user['id']})
    if not result.scalar_one_or_none():
        raise ApiError(404, 'Invitation not found.', 'Not Found')
    await db.commit()
    return {'data': {'id': member_id, 'declined': True}}


@router.delete('/{workspace_id}/leave')
async def leave(
    workspace_id: str,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    membership = await _authorize_member(db, workspace_id, user['id'])
    if membership['member_role'] == 'OWNER':
        raise ApiError(403, 'Transfer workspace ownership before leaving.', 'Forbidden')
    now = _utcnow()
    await db.execute(text("INSERT INTO audit_logs (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at) VALUES (:id, :workspace_id, :actor_id, 'workspace.member.left', 'workspace-member', :entity_id, CAST('{}' AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': workspace_id, 'actor_id': user['id'], 'entity_id': membership['member_id'], 'now': now})
    await db.execute(text('DELETE FROM team_members WHERE user_id = :user_id AND team_id IN (SELECT id FROM teams WHERE workspace_id = :workspace_id)'), {'user_id': user['id'], 'workspace_id': workspace_id})
    await db.execute(text('DELETE FROM workspace_members WHERE id = :id'), {'id': membership['member_id']})
    await db.commit()
    return {'data': {'id': membership['member_id'], 'left': True}}


@router.patch('/{workspace_id}/members/{member_id}')
async def update_member(
    workspace_id: str,
    member_id: str,
    payload: UpdateMemberInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _authorize_owner(db, workspace_id, user['id'])
    member_result = await db.execute(text('SELECT user_id, role FROM workspace_members WHERE id = :id AND workspace_id = :workspace_id LIMIT 1'), {'id': member_id, 'workspace_id': workspace_id})
    member = member_result.mappings().first()
    if not member:
        raise ApiError(404, 'Workspace member not found.', 'Not Found')
    role = _role(payload.role, invite=False)
    if member['user_id'] == user['id'] or member['role'] == 'OWNER' or role == 'OWNER':
        raise ApiError(403, 'Workspace ownership cannot be changed here.', 'Forbidden')
    await db.execute(text('UPDATE workspace_members SET role = :role, updated_at = :now WHERE id = :id'), {'id': member_id, 'role': role, 'now': _utcnow()})
    await db.commit()
    updated = await _member_row(db, workspace_id, member['user_id'])
    return {'data': _member(updated)}


@router.delete('/{workspace_id}/members/{member_id}')
async def remove_member(
    workspace_id: str,
    member_id: str,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _authorize_manager(db, workspace_id, user['id'])
    member_result = await db.execute(text('SELECT user_id, role FROM workspace_members WHERE id = :id AND workspace_id = :workspace_id LIMIT 1'), {'id': member_id, 'workspace_id': workspace_id})
    member = member_result.mappings().first()
    if not member:
        raise ApiError(404, 'Workspace member not found.', 'Not Found')
    if member['user_id'] == user['id'] or member['role'] == 'OWNER':
        raise ApiError(403, 'The workspace owner cannot be removed.', 'Forbidden')
    await db.execute(text('DELETE FROM team_members WHERE user_id = :user_id AND team_id IN (SELECT id FROM teams WHERE workspace_id = :workspace_id)'), {'user_id': member['user_id'], 'workspace_id': workspace_id})
    await db.execute(text('DELETE FROM workspace_members WHERE id = :id'), {'id': member_id})
    await db.commit()
    return {'data': {'id': member_id, 'removed': True}}
