from __future__ import annotations

import json
import unicodedata
from datetime import timedelta
from typing import Any, Literal

from fastapi import Depends, Query, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.identifiers import cuid
from ...core.slugs import RESERVED_WORKSPACE_SLUGS, url_slug
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ...services.auth_policy import microsoft_sign_in_enabled
from ..access.read_only import ADMIN_READ_ROLES
from ..identity.auth import create_workspace_bootstrap, current_user, normalized_email
from .commands import (
    ACCEPT_INVITATION_UPDATE_WORKSPACE_MEMBERS,
    BLOCK_AUTO_JOIN_INSERT_WORKSPACE_AUTO_JOIN_BLOCKS,
    DECLINE_INVITATION_DELETE_WORKSPACE_MEMBERS,
    DELETE_WORKSPACE_DELETE_WORKSPACES,
    DELETE_WORKSPACE_UPDATE_USER_UI_PREFERENCES,
    INVITE_INSERT_WORKSPACE_MEMBERS,
    INVITE_UPDATE_WORKSPACE_MEMBERS,
    LEAVE_DELETE_TEAM_MEMBERS,
    LEAVE_DELETE_WORKSPACE_MEMBERS,
    LEAVE_INSERT_AUDIT_LOGS,
    REMOVE_MEMBER_DELETE_TEAM_MEMBERS,
    REMOVE_MEMBER_DELETE_WORKSPACE_MEMBERS,
    UPDATE_AUTO_JOIN_INSERT_AUDIT_LOGS,
    UPDATE_AUTO_JOIN_UPDATE_WORKSPACES,
    UPDATE_MEMBER_UPDATE_WORKSPACE_MEMBERS,
    UPDATE_WORKSPACE_INSERT_AUDIT_LOGS,
    WRITE_DISPLAY_PREFERENCES_INSERT_AUDIT_LOGS,
    update_workspace_update_workspaces_sql,
    write_display_preferences_update_workspaces_sql,
)
from .queries import (
    ACCEPT_INVITATION_SELECT_WORKSPACE_MEMBERS,
    AUTO_JOIN_STATUS_SELECT_PROJECTS,
    DELETE_WORKSPACE_SELECT_WORKSPACES,
    INVITATION_CANDIDATES_SELECT_USERS,
    INVITE_SELECT_USERS,
    MINE_SELECT_WORKSPACE_MEMBERS,
    PENDING_INVITATIONS_SELECT_WORKSPACE_MEMBERS,
    REMOVE_MEMBER_SELECT_WORKSPACE_MEMBERS,
    RESOLVE_WORKSPACE_SELECT_WORKSPACES,
    UPDATE_MEMBER_SELECT_WORKSPACE_MEMBERS,
    UPDATE_WORKSPACE_SELECT_WORKSPACES,
    WORKSPACE_SUMMARY_SELECT_WORKSPACES,
    member_row_select_workspace_members_sql,
    members_select_workspace_members_sql,
    read_display_preferences_select_workspaces_sql,
)

router = APIRouter(prefix='/api/v1/workspaces', tags=['workspaces'])

USER_SELECT = '''
    u.id AS user_id_value, u.email AS user_email, u.name AS user_name,
    u.username AS user_username, u.title AS user_title, u.timezone AS user_timezone,
    u.avatar_url AS user_avatar_url, u.is_platform_admin AS user_is_platform_admin,
    u.email_verified_at AS user_email_verified_at, u.status AS user_status,
    u.created_at AS user_created_at, u.updated_at AS user_updated_at,
    u.last_login_at AS user_last_login_at, u.last_seen_at AS user_last_seen_at
'''


class CreateWorkspaceInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)


class UpdateWorkspaceInput(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    icon: str | None = Field(default=None, max_length=16)
    # Only the fields sent are changed. VI: Chỉ đổi các trường được gửi lên.
    slug: str | None = Field(default=None, max_length=63)


class DeleteWorkspaceInput(BaseModel):
    confirmationName: str = Field(min_length=1, max_length=240)


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
    if role not in {'OWNER', 'ADMIN', 'MEMBER', 'ADMIN_VIEWER'}:
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
        'lastSeenAt': row['user_last_seen_at'],
        'isOnline': bool(
            row['user_last_seen_at']
            and row['user_last_seen_at'] >= utcnow() - timedelta(minutes=2)
        ),
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
        member_row_select_workspace_members_sql(USER_SELECT),
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
    # ADMIN_VIEWER passes for reads; its writes are refused app-wide. VI: ADMIN_VIEWER qua được khi đọc; thao tác ghi bị chặn toàn app.
    if not membership or membership['member_status'] != 'ACTIVE' or membership['member_role'] not in ADMIN_READ_ROLES:
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
        'icon': row['workspace_icon'],
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
        WORKSPACE_SUMMARY_SELECT_WORKSPACES,
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
        read_display_preferences_select_workspaces_sql(column),
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
    now = utcnow()
    result = await db.execute(
        write_display_preferences_update_workspaces_sql(column),
        {'workspace_id': workspace_id, 'settings': json.dumps(settings), 'now': now},
    )
    row = result.mappings().first()
    if not row:
        raise ApiError(404, 'Workspace not found.', 'Not Found')
    await db.execute(
        WRITE_DISPLAY_PREFERENCES_INSERT_AUDIT_LOGS,
        {
            'id': cuid(),
            'workspace_id': workspace_id,
            'actor_id': user_id,
            'action': audit_action,
            'entity_id': workspace_id,
            'now': now,
        },
    )
    await db.commit()
    return {'settings': row['settings'], 'updatedAt': row['updated_at']}


@router.get('/resolve')
async def resolve_workspace(
    key: str = Query(min_length=1, max_length=100),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, str]]:
    """Turns the first URL segment into the workspace id and current slug when the caller is an
    active member. The key may be the id, the current slug or an earlier slug; an id wins. Anything
    else, including a workspace the caller is not in, is 404 so slugs reveal nothing.
    VI: Đổi đoạn URL đầu tiên thành id và slug hiện tại của workspace khi người gọi là thành viên
    VI: đang hoạt động. Khoá có thể là id, slug hiện tại hoặc slug cũ; id được ưu tiên. Mọi trường hợp
    VI: khác, kể cả workspace người gọi không thuộc, trả 404 để slug không làm lộ thông tin.
    """
    row = (
        await db.execute(
            RESOLVE_WORKSPACE_SELECT_WORKSPACES,
            {'key': key, 'user': user['id']},
        )
    ).mappings().first()
    if not row:
        raise ApiError(404, 'Workspace not found.', 'Not Found')
    return {'data': {'id': row['id'], 'slug': row['slug']}}


@router.get('/me')
async def mine(
    user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)
) -> dict[str, list[dict[str, Any]]]:
    result = await db.execute(
        MINE_SELECT_WORKSPACE_MEMBERS,
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
        PENDING_INVITATIONS_SELECT_WORKSPACE_MEMBERS,
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
            now=utcnow(),
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A workspace with this name already exists.', 'Conflict') from error
    return {'data': await _created_organization(db, bootstrap['workspace_id'])}


@router.delete('/{workspace_id}')
async def delete_workspace(
    workspace_id: str,
    payload: DeleteWorkspaceInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, bool]]:
    # Lock both identity and membership until deletion so ownership cannot change
    # between authorization and the cascading delete.
    result = await db.execute(
        DELETE_WORKSPACE_SELECT_WORKSPACES,
        {'workspace': workspace_id, 'user': user['id']},
    )
    workspace = result.mappings().first()
    if not workspace:
        raise ApiError(404, 'Workspace not found.', 'Not Found')
    if workspace['role'] != 'OWNER':
        raise ApiError(403, 'Only the workspace owner can delete this workspace.', 'Forbidden')
    if unicodedata.normalize('NFC', payload.confirmationName) != unicodedata.normalize('NFC', workspace['name']):
        raise ApiError(400, 'Enter the exact workspace name to confirm deletion.', 'Bad Request')
    await db.execute(
        DELETE_WORKSPACE_UPDATE_USER_UI_PREFERENCES,
        {'workspace': workspace_id, 'now': utcnow()},
    )
    await db.execute(DELETE_WORKSPACE_DELETE_WORKSPACES, {'workspace': workspace_id})
    await db.commit()
    return {'data': {'deleted': True}}


@router.patch('/{workspace_id}')
async def update_workspace(
    workspace_id: str,
    payload: UpdateWorkspaceInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    """Changes the display name, icon and/or URL slug; OWNER or ADMIN only. Only supplied fields
    are written, so renaming never regenerates the slug or modifies the organization. Blank/null
    names are rejected after trimming. Lock the row so concurrent writes audit the actual previous
    value. A slug follows the shared rules (`app.core.slugs`) plus reserved first path segments;
    one already owned by another
    workspace, now or earlier, is refused with 409 by the slug trigger, also under concurrency.
    Each change is written to the audit log with the old and new value.
    VI: Đổi tên hiển thị, icon và/hoặc slug URL workspace; chỉ OWNER hoặc ADMIN. Chỉ ghi trường gửi
    VI: lên nên đổi tên không tạo lại slug hoặc sửa organization. Từ chối tên rỗng/null sau trim.
    VI: Khóa dòng để thao tác ghi đồng thời ghi audit đúng giá trị trước. Slug theo quy tắc dùng chung
    VI: (`app.core.slugs`) cộng các đoạn path đầu đã dành riêng; slug đã thuộc workspace khác, hiện
    VI: tại hoặc trước đây, bị trigger slug từ chối với 409, kể cả khi ghi đồng thời. Mỗi thay đổi
    VI: được ghi vào audit log kèm giá trị cũ và mới.
    """
    await _authorize_manager(db, workspace_id, user['id'])
    values = payload.model_dump(exclude_unset=True)
    current = (await db.execute(UPDATE_WORKSPACE_SELECT_WORKSPACES, {'id': workspace_id})).mappings().first()
    if not current:
        raise ApiError(404, 'Workspace not found.', 'Not Found')
    changes: dict[str, Any] = {}
    if 'name' in values:
        name = (values['name'] or '').strip()
        if not name:
            raise ApiError(400, 'Workspace name must not be empty.', 'Bad Request')
        changes['name'] = name
    if 'icon' in values:
        changes['icon'] = (values['icon'] or '').strip() or None
    if 'slug' in values:
        changes['slug'] = url_slug(values['slug'] or '', reserved=RESERVED_WORKSPACE_SLUGS)
    if changes:
        sets = ', '.join(f'{column} = :{column}' for column in changes)
        try:
            await db.execute(
                update_workspace_update_workspaces_sql(sets),
                {**changes, 'workspace_id': workspace_id, 'now': utcnow()},
            )
        except IntegrityError as error:
            await db.rollback()
            if 'slug' in str(getattr(error, 'orig', error)):
                raise ApiError(409, 'This slug is already used by another workspace.', 'Conflict') from error
            raise
    for column, value in changes.items():
        if value == current[column]:
            continue
        await db.execute(
            UPDATE_WORKSPACE_INSERT_AUDIT_LOGS,
            {
                'id': cuid(),
                'workspace_id': workspace_id,
                'actor_id': user['id'],
                'action': f'workspace.{column}.updated',
                'entity_id': workspace_id,
                'metadata': json.dumps({column: value, 'previous': current[column]}),
                'now': utcnow(),
            },
        )
    await db.commit()
    workspace = await _workspace_summary(db, workspace_id)
    if not workspace:
        raise ApiError(404, 'Workspace not found.', 'Not Found')
    return {'data': workspace}


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
        members_select_workspace_members_sql(USER_SELECT),
        {'workspace_id': workspace_id},
    )
    return {'data': [_member(row) for row in result.mappings().all()]}


@router.get('/{workspace_id}/invitation-candidates')
async def invitation_candidates(
    workspace_id: str,
    response: Response,
    q: str = Query(default='', max_length=120),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _authorize_manager(db, workspace_id, user['id'])
    response.headers['Cache-Control'] = 'no-store'
    rows = (await db.execute(INVITATION_CANDIDATES_SELECT_USERS, {'query': q.strip().lower(), 'workspace': workspace_id})).mappings().all()
    return {'data': [dict(row) for row in rows[:25]], 'meta': {'hasMore': len(rows) > 25}}


@router.post('/{workspace_id}/invitations')
async def invite(
    workspace_id: str,
    payload: InviteMemberInput,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    await _authorize_manager(db, workspace_id, user['id'])
    email = normalized_email(payload.email)
    role = _role(payload.role, invite=True)
    result = await db.execute(INVITE_SELECT_USERS, {'email': email})
    matches = result.scalars().all()
    if len(matches) > 1:
        raise ApiError(409, 'Multiple accounts use this email. Contact your administrator.', 'Conflict')
    invited_id = matches[0] if matches else None
    if not invited_id:
        raise ApiError(404, 'This person needs to register a Flowie account before they can be invited.', 'Not Found')
    if invited_id == user['id']:
        raise ApiError(409, 'You are already in this workspace.', 'Conflict')
    existing = await _member_row(db, workspace_id, invited_id)
    if existing and existing['member_status'] == 'ACTIVE':
        raise ApiError(409, 'This person is already a workspace member.', 'Conflict')
    now = utcnow()
    if existing:
        await db.execute(INVITE_UPDATE_WORKSPACE_MEMBERS, {'id': existing['member_id'], 'role': role, 'invited_by': user['id'], 'now': now})
    else:
        await db.execute(INVITE_INSERT_WORKSPACE_MEMBERS, {'id': cuid(), 'workspace_id': workspace_id, 'user_id': invited_id, 'role': role, 'invited_by': user['id'], 'now': now})
    await db.commit()
    invited = await _member_row(db, workspace_id, invited_id)
    return {'data': _member(invited)}


@router.post('/invitations/{member_id}/accept')
async def accept_invitation(
    member_id: str,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    result = await db.execute(ACCEPT_INVITATION_SELECT_WORKSPACE_MEMBERS, {'id': member_id, 'user_id': user['id']})
    workspace_id = result.scalar_one_or_none()
    if not workspace_id:
        raise ApiError(404, 'Invitation not found.', 'Not Found')
    await db.execute(ACCEPT_INVITATION_UPDATE_WORKSPACE_MEMBERS, {'id': member_id, 'now': utcnow()})
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
    result = await db.execute(DECLINE_INVITATION_DELETE_WORKSPACE_MEMBERS, {'id': member_id, 'user_id': user['id']})
    if not result.scalar_one_or_none():
        raise ApiError(404, 'Invitation not found.', 'Not Found')
    await db.commit()
    return {'data': {'id': member_id, 'declined': True}}


async def _block_auto_join(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    # The member row is about to go, so this is what keeps the next sign-in from bringing them back.
    # VI: Dòng thành viên sắp bị xoá, nên đây là thứ giữ lần đăng nhập sau không đưa họ quay lại.
    await db.execute(
        BLOCK_AUTO_JOIN_INSERT_WORKSPACE_AUTO_JOIN_BLOCKS,
        {'workspace_id': workspace_id, 'user_id': user_id},
    )


class AutoJoinInput(BaseModel):
    enabled: bool


@router.get('/{workspace_id}/auto-join')
async def auto_join_status(
    workspace_id: str,
    request: Request,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    """What turning automatic joining on would expose: everyone can read data with no team.
    VI: Những gì sẽ mở ra khi bật tự vào: mọi người đọc được dữ liệu không gắn team.
    """
    await _authorize_manager(db, workspace_id, user['id'])
    result = await db.execute(
        AUTO_JOIN_STATUS_SELECT_PROJECTS,
        {'workspace_id': workspace_id},
    )
    row = result.mappings().one()
    return {'data': {
        'available': microsoft_sign_in_enabled(request.app.state.settings),
        'enabled': row['auto_join_tenant_id'] is not None,
        'teamlessProjects': row['projects'],
        'teamlessIssues': row['issues'],
        'teamlessDocuments': row['documents'],
    }}


@router.put('/{workspace_id}/auto-join')
async def update_auto_join(
    workspace_id: str,
    payload: AutoJoinInput,
    request: Request,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, bool]]:
    await _authorize_manager(db, workspace_id, user['id'])
    settings = request.app.state.settings
    if payload.enabled and not microsoft_sign_in_enabled(settings):
        raise ApiError(409, 'Microsoft sign-in is not configured.', 'Conflict')
    now = utcnow()
    await db.execute(
        UPDATE_AUTO_JOIN_UPDATE_WORKSPACES,
        {'tenant_id': settings.azure_ad_tenant_id if payload.enabled else None, 'now': now, 'workspace_id': workspace_id},
    )
    await db.execute(
        UPDATE_AUTO_JOIN_INSERT_AUDIT_LOGS,
        {'id': cuid(), 'workspace_id': workspace_id, 'actor_id': user['id'], 'metadata': json.dumps({'enabled': payload.enabled}), 'now': now},
    )
    await db.commit()
    return {'data': {'enabled': payload.enabled}}


@router.delete('/{workspace_id}/leave')
async def leave(
    workspace_id: str,
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, dict[str, Any]]:
    membership = await _authorize_member(db, workspace_id, user['id'])
    if membership['member_role'] == 'OWNER':
        raise ApiError(403, 'Transfer workspace ownership before leaving.', 'Forbidden')
    now = utcnow()
    await db.execute(LEAVE_INSERT_AUDIT_LOGS, {'id': cuid(), 'workspace_id': workspace_id, 'actor_id': user['id'], 'entity_id': membership['member_id'], 'now': now})
    await db.execute(LEAVE_DELETE_TEAM_MEMBERS, {'user_id': user['id'], 'workspace_id': workspace_id})
    await _block_auto_join(db, workspace_id, user['id'])
    await db.execute(LEAVE_DELETE_WORKSPACE_MEMBERS, {'id': membership['member_id']})
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
    member_result = await db.execute(UPDATE_MEMBER_SELECT_WORKSPACE_MEMBERS, {'id': member_id, 'workspace_id': workspace_id})
    member = member_result.mappings().first()
    if not member:
        raise ApiError(404, 'Workspace member not found.', 'Not Found')
    role = _role(payload.role, invite=False)
    if member['user_id'] == user['id'] or member['role'] == 'OWNER' or role == 'OWNER':
        raise ApiError(403, 'Workspace ownership cannot be changed here.', 'Forbidden')
    await db.execute(UPDATE_MEMBER_UPDATE_WORKSPACE_MEMBERS, {'id': member_id, 'role': role, 'now': utcnow()})
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
    member_result = await db.execute(REMOVE_MEMBER_SELECT_WORKSPACE_MEMBERS, {'id': member_id, 'workspace_id': workspace_id})
    member = member_result.mappings().first()
    if not member:
        raise ApiError(404, 'Workspace member not found.', 'Not Found')
    if member['user_id'] == user['id'] or member['role'] == 'OWNER':
        raise ApiError(403, 'The workspace owner cannot be removed.', 'Forbidden')
    await db.execute(REMOVE_MEMBER_DELETE_TEAM_MEMBERS, {'user_id': member['user_id'], 'workspace_id': workspace_id})
    await _block_auto_join(db, workspace_id, member['user_id'])
    await db.execute(REMOVE_MEMBER_DELETE_WORKSPACE_MEMBERS, {'id': member_id})
    await db.commit()
    return {'data': {'id': member_id, 'removed': True}}
