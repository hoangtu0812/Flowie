from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .teams import _team

# This router is deliberately private until the complete Projects contract is
# ported. It lets us exercise real Python/database behavior without switching
# any Circle screen away from the stable legacy facade mid-migration.
router = APIRouter(prefix='/api/v1/_native/projects', tags=['native-projects'])
# The public router intentionally exposes only the Project paths that have
# completed a Python contract audit. All other Project paths continue through
# the facade, so the unchanged Circle UI never observes a partial migration.
public_router = APIRouter(prefix='/api/v1/projects', tags=['projects'])
ProjectType = Literal['GENERAL', 'PRODUCT', 'MARKETING', 'OPERATIONS', 'EVENT', 'CLIENT', 'RESEARCH', 'CUSTOM']
ProjectCustomFieldType = Literal['TEXT', 'NUMBER', 'DATE', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'URL']
ProjectStatusCategory = Literal['backlog', 'planned', 'in-progress', 'completed', 'canceled']

# Keep the persisted Project workflow compatible with Circle's unchanged
# selector. The original UI has this fixed catalog, so presentation does not
# depend on whichever partial status rows happened to exist before migration.
CIRCLE_PROJECT_STATUSES = (
    ('in-progress', 'in-progress', '#facc15'),
    ('technical-review', 'in-progress', '#22c55e'),
    ('done', 'completed', '#5e6ad2'),
    ('paused', 'in-progress', '#26b5ce'),
    ('to-do', 'planned', '#99a2b2'),
    ('backlog', 'backlog', '#95a2b3'),
    ('triage', 'backlog', '#f2790f'),
    ('idea', 'backlog', '#5e6ad2'),
    ('product-feedback', 'in-progress', '#f2994a'),
    ('blocked', 'in-progress', '#eb5757'),
    ('shipped', 'completed', '#4cb782'),
    ('canceled', 'canceled', '#95a2b3'),
    ('duplicate', 'canceled', '#95a2b3'),
)


class CreateProjectInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    templateId: str | None = None
    teamId: str | None = None
    name: str = Field(min_length=2, max_length=120)
    identifier: str = Field(min_length=1, max_length=24)
    description: str | None = Field(default=None, max_length=2000)
    type: ProjectType | None = None


class UpdateProjectInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    status: str | None = Field(default=None, max_length=32)
    priority: str | None = Field(default=None, max_length=32)
    health: str | None = Field(default=None, max_length=32)
    leadId: str | None = None
    teamId: str | None = None
    startDate: str | None = None
    targetDate: str | None = None
    labelIds: list[str] | None = None
    type: ProjectType | None = None


class ProjectMembersInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    userIds: list[str] = Field(max_length=100)


class MilestoneInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    title: str = Field(min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    targetDate: str | None = None
    position: int | None = Field(default=None, ge=0)


class UpdateMilestoneInput(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    targetDate: str | None = None
    completed: bool | None = None
    position: int | None = Field(default=None, ge=0)


class ProjectUpdateInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    body: str = Field(min_length=1, max_length=4000)
    kind: Literal['update', 'comment'] | None = None
    health: Literal['on-track', 'at-risk', 'off-track'] | None = None


class ProjectResourceInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=160)
    url: str = Field(min_length=1, max_length=2000)


class CreateProjectCustomFieldInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=80)
    type: ProjectCustomFieldType
    description: str | None = Field(default=None, max_length=500)
    options: list[str] | None = None
    required: bool | None = None
    position: int | None = Field(default=None, ge=0)


class UpdateProjectCustomFieldInput(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    type: ProjectCustomFieldType | None = None
    description: str | None = Field(default=None, max_length=500)
    options: list[str] | None = None
    required: bool | None = None
    position: int | None = Field(default=None, ge=0)


class ProjectCustomFieldValueInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    value: Any = None


class CreateProjectLabelInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=80)
    color: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    description: str | None = Field(default=None, max_length=500)


class UpdateProjectLabelInput(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, pattern=r'^#[0-9a-fA-F]{6}$')
    description: str | None = Field(default=None, max_length=500)


class CreateProjectStatusInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    name: str = Field(min_length=1, max_length=32)
    category: ProjectStatusCategory
    color: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    position: int | None = Field(default=None, ge=0)


class UpdateProjectStatusInput(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=32)
    category: ProjectStatusCategory | None = None
    color: str | None = Field(default=None, pattern=r'^#[0-9a-fA-F]{6}$')
    position: int | None = Field(default=None, ge=0)


class CreateProjectTemplateInput(BaseModel):
    workspaceId: str = Field(min_length=1)
    name: str = Field(min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    type: ProjectType | None = None
    config: dict[str, Any] | None = None


class UpdateProjectTemplateInput(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    type: ProjectType | None = None
    config: dict[str, Any] | None = None


async def _workspace_access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(text("SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"), {'workspace_id': workspace_id, 'user_id': user_id})
    if result.scalar_one_or_none() is None:
        raise ApiError(403, 'You do not have access to this workspace.', 'Forbidden')


async def _workspace_manager(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(
        text("SELECT role FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"),
        {'workspace_id': workspace_id, 'user_id': user_id},
    )
    if result.scalar_one_or_none() not in {'OWNER', 'ADMIN'}:
        raise ApiError(403, 'Workspace administrator access is required.', 'Forbidden')


def _custom_field(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'name': row['name'],
        'type': row['type'], 'description': row['description'], 'options': row['options'],
        'required': row['required'], 'position': row['position'], 'createdAt': row['created_at'],
        'updatedAt': row['updated_at'],
    }


def _custom_field_options(field_type: ProjectCustomFieldType, options: list[str] | None) -> list[str] | None:
    if field_type not in {'SELECT', 'MULTI_SELECT'}:
        return None
    normalized = list(dict.fromkeys(option.strip() for option in (options or []) if option.strip()))
    if not normalized:
        raise ApiError(400, 'Select fields require at least one option.', 'Bad Request')
    return normalized


@router.get('/custom-fields')
@public_router.get('/custom-fields')
async def list_custom_fields(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    rows = await db.execute(text('SELECT * FROM project_custom_fields WHERE workspace_id = :workspace_id ORDER BY position ASC, name ASC'), {'workspace_id': workspaceId})
    return {'data': [_custom_field(row) for row in rows.mappings().all()]}


@router.post('/custom-fields')
@public_router.post('/custom-fields')
async def create_custom_field(payload: CreateProjectCustomFieldInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, payload.workspaceId, user['id'])
    now = _utcnow()
    field_id = _cuid()
    try:
        await db.execute(
            text('''INSERT INTO project_custom_fields
                    (id, workspace_id, name, type, description, options, required, position, created_at, updated_at)
                    VALUES (:id, :workspace_id, :name, CAST(:type AS "ProjectCustomFieldType"), :description, CAST(:options AS jsonb), :required, :position, :now, :now)'''),
            {
                'id': field_id, 'workspace_id': payload.workspaceId, 'name': payload.name.strip(),
                'type': payload.type, 'description': payload.description.strip() if payload.description else None,
                'options': json.dumps(_custom_field_options(payload.type, payload.options)),
                'required': payload.required or False, 'position': payload.position or 0, 'now': now,
            },
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A project property with this name already exists.', 'Conflict') from error
    row = (await db.execute(text('SELECT * FROM project_custom_fields WHERE id = :id'), {'id': field_id})).mappings().one()
    return {'data': _custom_field(row)}


@router.patch('/custom-fields/{field_id}')
@public_router.patch('/custom-fields/{field_id}')
async def update_custom_field(field_id: str, payload: UpdateProjectCustomFieldInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    current = (await db.execute(text('SELECT * FROM project_custom_fields WHERE id = :id AND workspace_id = :workspace_id'), {'id': field_id, 'workspace_id': workspaceId})).mappings().first()
    if not current:
        raise ApiError(404, 'Project custom field not found.', 'Not Found')
    values = payload.model_dump(exclude_unset=True)
    field_type = values.get('type', current['type'])
    options = _custom_field_options(field_type, values['options'] if 'options' in values else current['options'])
    assignments, params = ['type = CAST(:type AS "ProjectCustomFieldType")', 'options = CAST(:options AS jsonb)', 'updated_at = :now'], {'id': field_id, 'type': field_type, 'options': json.dumps(options), 'now': _utcnow()}
    for field, column in {'name': 'name', 'description': 'description', 'required': 'required', 'position': 'position'}.items():
        if field in values:
            value = values[field]
            params[field] = value.strip() if field in {'name', 'description'} and isinstance(value, str) else value
            assignments.append(f'{column} = :{field}')
    try:
        if field_type != current['type']:
            await db.execute(text('DELETE FROM project_custom_field_values WHERE field_id = :id'), {'id': field_id})
        await db.execute(text(f"UPDATE project_custom_fields SET {', '.join(assignments)} WHERE id = :id"), params)
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A project property with this name already exists.', 'Conflict') from error
    row = (await db.execute(text('SELECT * FROM project_custom_fields WHERE id = :id'), {'id': field_id})).mappings().one()
    return {'data': _custom_field(row)}


@router.delete('/custom-fields/{field_id}')
@public_router.delete('/custom-fields/{field_id}')
async def delete_custom_field(field_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    exists = await db.execute(text('SELECT 1 FROM project_custom_fields WHERE id = :id AND workspace_id = :workspace_id'), {'id': field_id, 'workspace_id': workspaceId})
    if exists.scalar_one_or_none() is None:
        raise ApiError(404, 'Project custom field not found.', 'Not Found')
    await db.execute(text('DELETE FROM project_custom_fields WHERE id = :id'), {'id': field_id})
    await db.commit()
    return {'data': {'id': field_id, 'deleted': True}}


def _project_label(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'name': row['name'],
        'color': row['color'], 'description': row['description'], 'createdAt': row['created_at'],
        'updatedAt': row['updated_at'], '_count': {'projectLinks': row['project_count']},
    }


@router.get('/labels')
@public_router.get('/labels')
async def list_project_labels(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    rows = await db.execute(
        text('''SELECT l.*, COUNT(pl.project_id)::integer AS project_count
                FROM project_labels l LEFT JOIN project_label_links pl ON pl.label_id = l.id
                WHERE l.workspace_id = :workspace_id
                GROUP BY l.id ORDER BY l.name ASC'''),
        {'workspace_id': workspaceId},
    )
    return {'data': [_project_label(row) for row in rows.mappings().all()]}


@router.post('/labels')
@public_router.post('/labels')
async def create_project_label(payload: CreateProjectLabelInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user['id'])
    label_id, now = _cuid(), _utcnow()
    try:
        await db.execute(
            text('''INSERT INTO project_labels (id, workspace_id, name, color, description, created_at, updated_at)
                    VALUES (:id, :workspace_id, :name, :color, :description, :now, :now)'''),
            {'id': label_id, 'workspace_id': payload.workspaceId, 'name': payload.name.strip(), 'color': payload.color, 'description': payload.description.strip() if payload.description else None, 'now': now},
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A project label with this name already exists.', 'Conflict') from error
    row = (await db.execute(text('''SELECT l.*, 0::integer AS project_count FROM project_labels l WHERE l.id = :id'''), {'id': label_id})).mappings().one()
    return {'data': _project_label(row)}


@router.patch('/labels/{label_id}')
@public_router.patch('/labels/{label_id}')
async def update_project_label(label_id: str, payload: UpdateProjectLabelInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    current = (await db.execute(text('SELECT 1 FROM project_labels WHERE id = :id AND workspace_id = :workspace_id'), {'id': label_id, 'workspace_id': workspaceId})).scalar_one_or_none()
    if current is None:
        raise ApiError(404, 'Project label not found.', 'Not Found')
    values = payload.model_dump(exclude_unset=True)
    if values:
        params, sets = {'id': label_id, 'now': _utcnow()}, ['updated_at = :now']
        for field in ('name', 'color', 'description'):
            if field in values:
                params[field] = values[field].strip() if isinstance(values[field], str) and field in {'name', 'description'} else values[field]
                sets.append(f'{"description" if field == "description" else field} = :{field}')
        try:
            await db.execute(text(f"UPDATE project_labels SET {', '.join(sets)} WHERE id = :id"), params)
            await db.commit()
        except IntegrityError as error:
            await db.rollback()
            raise ApiError(409, 'A project label with this name already exists.', 'Conflict') from error
    row = (await db.execute(text('''SELECT l.*, COUNT(pl.project_id)::integer AS project_count FROM project_labels l LEFT JOIN project_label_links pl ON pl.label_id = l.id WHERE l.id = :id GROUP BY l.id'''), {'id': label_id})).mappings().one()
    return {'data': _project_label(row)}


@router.delete('/labels/{label_id}')
@public_router.delete('/labels/{label_id}')
async def delete_project_label(label_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    exists = await db.execute(text('SELECT 1 FROM project_labels WHERE id = :id AND workspace_id = :workspace_id'), {'id': label_id, 'workspace_id': workspaceId})
    if exists.scalar_one_or_none() is None:
        raise ApiError(404, 'Project label not found.', 'Not Found')
    await db.execute(text('DELETE FROM project_labels WHERE id = :id'), {'id': label_id})
    await db.commit()
    return {'data': {'id': label_id, 'deleted': True}}


def _project_status(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'name': row['name'],
        'category': row['category'], 'color': row['color'], 'position': row['position'],
        'projectCount': row['project_count'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
    }


def _status_name(value: str) -> str:
    return '-'.join(value.strip().lower().split())


async def _project_statuses(db: AsyncSession, workspace_id: str) -> list[dict[str, Any]]:
    await _ensure_circle_project_statuses(db, workspace_id)
    rows = await db.execute(
        text('''SELECT s.*, COUNT(p.id)::integer AS project_count
                FROM project_statuses s LEFT JOIN projects p ON p.workspace_id = s.workspace_id
                   AND p.status = s.name AND p.archived_at IS NULL
                WHERE s.workspace_id = :workspace_id
                GROUP BY s.id ORDER BY s.category ASC, s.position ASC, s.name ASC'''),
        {'workspace_id': workspace_id},
    )
    return [_project_status(row) for row in rows.mappings().all()]


@router.get('/statuses')
@public_router.get('/statuses')
async def list_project_statuses(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    statuses = await _project_statuses(db, workspaceId)
    await db.commit()
    return {'data': statuses}


@router.post('/statuses')
@public_router.post('/statuses')
async def create_project_status(payload: CreateProjectStatusInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, payload.workspaceId, user['id'])
    status_id, now = _cuid(), _utcnow()
    try:
        await db.execute(
            text('''INSERT INTO project_statuses (id, workspace_id, name, category, color, position, created_at, updated_at)
                    VALUES (:id, :workspace_id, :name, :category, :color, :position, :now, :now)'''),
            {'id': status_id, 'workspace_id': payload.workspaceId, 'name': _status_name(payload.name), 'category': payload.category, 'color': payload.color, 'position': payload.position or 0, 'now': now},
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A project status with this name already exists.', 'Conflict') from error
    row = (await db.execute(text('''SELECT s.*, 0::integer AS project_count FROM project_statuses s WHERE s.id = :id'''), {'id': status_id})).mappings().one()
    return {'data': _project_status(row)}


@router.patch('/statuses/{status_id}')
@public_router.patch('/statuses/{status_id}')
async def update_project_status(status_id: str, payload: UpdateProjectStatusInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    current = (await db.execute(text('SELECT * FROM project_statuses WHERE id = :id AND workspace_id = :workspace_id'), {'id': status_id, 'workspace_id': workspaceId})).mappings().first()
    if not current:
        raise ApiError(404, 'Project status not found.', 'Not Found')
    values = payload.model_dump(exclude_unset=True)
    next_name = _status_name(values['name']) if 'name' in values else current['name']
    params, sets = {'id': status_id, 'now': _utcnow(), 'name': next_name}, ['name = :name', 'updated_at = :now']
    for field in ('category', 'color', 'position'):
        if field in values:
            params[field] = values[field]
            sets.append(f'{field} = :{field}')
    try:
        if next_name != current['name']:
            await db.execute(text('UPDATE projects SET status = :name, updated_at = :now WHERE workspace_id = :workspace_id AND status = :previous'), {**params, 'workspace_id': workspaceId, 'previous': current['name']})
        await db.execute(text(f"UPDATE project_statuses SET {', '.join(sets)} WHERE id = :id"), params)
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A project status with this name already exists.', 'Conflict') from error
    row = (await db.execute(text('''SELECT s.*, COUNT(p.id)::integer AS project_count FROM project_statuses s LEFT JOIN projects p ON p.workspace_id = s.workspace_id AND p.status = s.name AND p.archived_at IS NULL WHERE s.id = :id GROUP BY s.id'''), {'id': status_id})).mappings().one()
    return {'data': _project_status(row)}


@router.delete('/statuses/{status_id}')
@public_router.delete('/statuses/{status_id}')
async def delete_project_status(status_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    status = (await db.execute(text('SELECT name FROM project_statuses WHERE id = :id AND workspace_id = :workspace_id'), {'id': status_id, 'workspace_id': workspaceId})).mappings().first()
    if not status:
        raise ApiError(404, 'Project status not found.', 'Not Found')
    in_use = await db.execute(text('SELECT COUNT(*) FROM projects WHERE workspace_id = :workspace_id AND status = :status AND archived_at IS NULL'), {'workspace_id': workspaceId, 'status': status['name']})
    if in_use.scalar_one() > 0:
        raise ApiError(400, 'Move projects to another status before deleting it.', 'Bad Request')
    await db.execute(text('DELETE FROM project_statuses WHERE id = :id'), {'id': status_id})
    await db.commit()
    return {'data': {'id': status_id, 'deleted': True}}


def _project_template(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'name': row['name'],
        'description': row['description'], 'type': row['type'], 'config': row['config'],
        'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
    }


@router.get('/templates')
@public_router.get('/templates')
async def list_project_templates(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    rows = await db.execute(text('SELECT * FROM project_templates WHERE workspace_id = :workspace_id ORDER BY name ASC'), {'workspace_id': workspaceId})
    return {'data': [_project_template(row) for row in rows.mappings().all()]}


@router.post('/templates')
@public_router.post('/templates')
async def create_project_template(payload: CreateProjectTemplateInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, payload.workspaceId, user['id'])
    template_id, now = _cuid(), _utcnow()
    try:
        await db.execute(
            text('''INSERT INTO project_templates (id, workspace_id, name, description, type, config, created_at, updated_at)
                    VALUES (:id, :workspace_id, :name, :description, CAST(:type AS "ProjectType"), CAST(:config AS jsonb), :now, :now)'''),
            {'id': template_id, 'workspace_id': payload.workspaceId, 'name': payload.name.strip(), 'description': payload.description.strip() if payload.description else None, 'type': payload.type or 'GENERAL', 'config': json.dumps(payload.config or {}), 'now': now},
        )
        await db.commit()
    except IntegrityError as error:
        await db.rollback()
        raise ApiError(409, 'A project template with this name already exists.', 'Conflict') from error
    row = (await db.execute(text('SELECT * FROM project_templates WHERE id = :id'), {'id': template_id})).mappings().one()
    return {'data': _project_template(row)}


@router.patch('/templates/{template_id}')
@public_router.patch('/templates/{template_id}')
async def update_project_template(template_id: str, payload: UpdateProjectTemplateInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    exists = await db.execute(text('SELECT 1 FROM project_templates WHERE id = :id AND workspace_id = :workspace_id'), {'id': template_id, 'workspace_id': workspaceId})
    if exists.scalar_one_or_none() is None:
        raise ApiError(404, 'Project template not found.', 'Not Found')
    values = payload.model_dump(exclude_unset=True)
    if values:
        params, sets = {'id': template_id, 'now': _utcnow()}, ['updated_at = :now']
        for field in ('name', 'description', 'type'):
            if field in values:
                params[field] = values[field].strip() if field in {'name', 'description'} and isinstance(values[field], str) else values[field]
                sets.append(f'{field} = :{field}')
        if 'config' in values:
            params['config'] = json.dumps(values['config'])
            sets.append('config = CAST(:config AS jsonb)')
        try:
            await db.execute(text(f"UPDATE project_templates SET {', '.join(sets)} WHERE id = :id"), params)
            await db.commit()
        except IntegrityError as error:
            await db.rollback()
            raise ApiError(409, 'A project template with this name already exists.', 'Conflict') from error
    row = (await db.execute(text('SELECT * FROM project_templates WHERE id = :id'), {'id': template_id})).mappings().one()
    return {'data': _project_template(row)}


@router.delete('/templates/{template_id}')
@public_router.delete('/templates/{template_id}')
async def delete_project_template(template_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_manager(db, workspaceId, user['id'])
    exists = await db.execute(text('SELECT 1 FROM project_templates WHERE id = :id AND workspace_id = :workspace_id'), {'id': template_id, 'workspace_id': workspaceId})
    if exists.scalar_one_or_none() is None:
        raise ApiError(404, 'Project template not found.', 'Not Found')
    await db.execute(text('DELETE FROM project_templates WHERE id = :id'), {'id': template_id})
    await db.commit()
    return {'data': {'id': template_id, 'deleted': True}}


async def _ensure_circle_project_statuses(db: AsyncSession, workspace_id: str) -> None:
    now = _utcnow()
    for position, (name, category, color) in enumerate(CIRCLE_PROJECT_STATUSES):
        await db.execute(
            text(
                '''INSERT INTO project_statuses
                   (id, workspace_id, name, category, color, position, created_at, updated_at)
                   VALUES (:id, :workspace_id, :name, :category, :color, :position, :now, :now)
                   ON CONFLICT (workspace_id, name) DO NOTHING'''
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


async def _team_access(db: AsyncSession, workspace_id: str, team_id: str, user_id: str) -> None:
    result = await db.execute(text('''SELECT 1 FROM teams t JOIN team_members tm ON tm.team_id = t.id WHERE t.id = :team_id AND t.workspace_id = :workspace_id AND t.archived_at IS NULL AND tm.user_id = :user_id'''), {'team_id': team_id, 'workspace_id': workspace_id, 'user_id': user_id})
    if result.scalar_one_or_none() is None:
        raise ApiError(403, 'You do not have access to this team.', 'Forbidden')


def _date(value: str | None) -> datetime | None:
    if value is None: return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise ApiError(400, 'date must be a valid ISO 8601 datetime', 'Bad Request') from error
    return parsed.astimezone(timezone.utc).replace(tzinfo=None) if parsed.tzinfo else parsed


def _url(value: str) -> str:
    normalized = value.strip()
    parsed = urlparse(normalized)
    if parsed.scheme not in {'http', 'https'} or not parsed.netloc:
        raise ApiError(400, 'Resource URL must be a valid HTTP or HTTPS URL.', 'Bad Request')
    return normalized


def _custom_field_value(field: Any, value: Any) -> Any:
    if value is None:
        return None
    field_type = field['type']
    if field_type in {'TEXT', 'URL'}:
        if not isinstance(value, str):
            raise ApiError(400, f'{field["name"]} must be text.', 'Bad Request')
        return _url(value) if field_type == 'URL' and value.strip() else value.strip()
    if field_type == 'NUMBER':
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ApiError(400, f'{field["name"]} must be a number.', 'Bad Request')
        return value
    if field_type == 'DATE':
        if not isinstance(value, str):
            raise ApiError(400, f'{field["name"]} must be a date.', 'Bad Request')
        _date(value)
        return value
    if field_type == 'BOOLEAN':
        if not isinstance(value, bool):
            raise ApiError(400, f'{field["name"]} must be true or false.', 'Bad Request')
        return value
    options = field['options'] or []
    if field_type == 'SELECT':
        if not isinstance(value, str) or value not in options:
            raise ApiError(400, f'{field["name"]} must use a configured option.', 'Bad Request')
        return value
    if field_type == 'MULTI_SELECT':
        if not isinstance(value, list) or any(not isinstance(item, str) or item not in options for item in value):
            raise ApiError(400, f'{field["name"]} must use configured options.', 'Bad Request')
        return list(dict.fromkeys(value))
    raise ApiError(400, 'Unsupported project custom field type.', 'Bad Request')


async def _project_custom_fields(db: AsyncSession, project_id: str, workspace_id: str) -> list[dict[str, Any]]:
    rows = await db.execute(
        text('''SELECT f.*, v.value FROM project_custom_fields f
                LEFT JOIN project_custom_field_values v ON v.field_id = f.id AND v.project_id = :project_id
                WHERE f.workspace_id = :workspace_id ORDER BY f.position ASC, f.name ASC'''),
        {'project_id': project_id, 'workspace_id': workspace_id},
    )
    return [{**_custom_field(row), 'value': row['value']} for row in rows.mappings().all()]


async def _members(db: AsyncSession, project_id: str) -> list[dict[str, Any]]:
    members = await db.execute(text('''SELECT pm.project_id, pm.user_id, pm.created_at, u.id, u.name, u.avatar_url FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = :project_id ORDER BY pm.created_at'''), {'project_id': project_id})
    return [{'projectId': member['project_id'], 'userId': member['user_id'], 'createdAt': member['created_at'], 'user': {'id': member['id'], 'name': member['name'], 'avatarUrl': member['avatar_url']}} for member in members.mappings().all()]


async def _activity(db: AsyncSession, project_id: str) -> list[dict[str, Any]]:
    rows = await db.execute(text('''SELECT a.*, u.id AS actor_id_value, u.name AS actor_name, u.avatar_url AS actor_avatar_url FROM activities a LEFT JOIN users u ON u.id = a.actor_id WHERE a.project_id = :project_id ORDER BY a.created_at DESC LIMIT 100'''), {'project_id': project_id})
    return [{'id': row['id'], 'workspaceId': row['workspace_id'], 'projectId': row['project_id'], 'actorId': row['actor_id'], 'type': row['type'], 'data': row['data'], 'createdAt': row['created_at'], 'actor': {'id': row['actor_id_value'], 'name': row['actor_name'], 'avatarUrl': row['actor_avatar_url']} if row['actor_id_value'] else None} for row in rows.mappings().all()]


async def _project(db: AsyncSession, project_id: str, workspace_id: str, user_id: str, *, include_favorites: bool = True) -> dict[str, Any]:
    result = await db.execute(text('''SELECT p.*, t.id AS team_id_value, t.name AS team_name, t.identifier AS team_identifier, t.icon AS team_icon, u.id AS lead_id_value, u.name AS lead_name, u.avatar_url AS lead_avatar_url, (SELECT COUNT(*) FROM issues i WHERE i.project_id = p.id) AS issue_count, EXISTS(SELECT 1 FROM project_favorites f WHERE f.project_id = p.id AND f.user_id = :user_id) AS is_favorite FROM projects p LEFT JOIN teams t ON t.id = p.team_id LEFT JOIN users u ON u.id = p.lead_id WHERE p.id = :project_id AND p.workspace_id = :workspace_id AND p.archived_at IS NULL LIMIT 1'''), {'project_id': project_id, 'workspace_id': workspace_id, 'user_id': user_id})
    row = result.mappings().first()
    if not row: raise ApiError(404, 'Project not found.', 'Not Found')
    if row['team_id']:
        await _team_access(db, workspace_id, row['team_id'], user_id)
    team = None
    if row['team_id_value']:
        team_result = await db.execute(text('SELECT * FROM teams WHERE id = :team_id'), {'team_id': row['team_id_value']})
        team_row = team_result.mappings().first()
        team = _team(team_row) if team_row else None
    labels = await db.execute(text('''SELECT l.* FROM project_label_links pl JOIN project_labels l ON l.id = pl.label_id WHERE pl.project_id = :project_id ORDER BY l.name'''), {'project_id': project_id})
    resources = await db.execute(text('''SELECT r.*, u.id AS creator_id_value, u.name AS creator_name, u.avatar_url AS creator_avatar_url FROM project_resources r JOIN users u ON u.id = r.created_by WHERE r.project_id = :project_id ORDER BY r.created_at'''), {'project_id': project_id})
    initiatives = await db.execute(text('''SELECT ip.initiative_id, ip.project_id, ip.created_at, i.id, i.name FROM initiative_projects ip JOIN initiatives i ON i.id = ip.initiative_id WHERE ip.project_id = :project_id'''), {'project_id': project_id})
    issues = await db.execute(text('''SELECT i.id, i.identifier, i.title, i.priority, i.updated_at, s.id AS status_id_value, s.name AS status_name, s.category AS status_category, s.color AS status_color, a.id AS assignee_id_value, a.name AS assignee_name, a.avatar_url AS assignee_avatar_url FROM issues i JOIN issue_statuses s ON s.id = i.status_id LEFT JOIN users a ON a.id = i.assignee_id WHERE i.project_id = :project_id AND i.archived_at IS NULL ORDER BY i.updated_at DESC'''), {'project_id': project_id})
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'teamId': row['team_id'], 'name': row['name'], 'identifier': row['identifier'], 'description': row['description'], 'type': row['type'], 'status': row['status'], 'priority': row['priority'], 'health': row['health'], 'leadId': row['lead_id'], 'startDate': row['start_date'], 'targetDate': row['target_date'], 'archivedAt': row['archived_at'], 'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
        'team': team,
        'lead': {'id': row['lead_id_value'], 'name': row['lead_name'], 'avatarUrl': row['lead_avatar_url']} if row['lead_id_value'] else None,
        '_count': {'issues': row['issue_count']}, 'labelLinks': [{'label': {'id': label['id'], 'workspaceId': label['workspace_id'], 'name': label['name'], 'color': label['color'], 'description': label['description'], 'createdAt': label['created_at'], 'updatedAt': label['updated_at']}} for label in labels.mappings().all()],
        'members': await _members(db, project_id),
        'issues': [{'id': issue['id'], 'status': {'category': issue['status_category']}, 'assignee': {'id': issue['assignee_id_value'], 'name': issue['assignee_name'], 'avatarUrl': issue['assignee_avatar_url']} if issue['assignee_id_value'] else None} for issue in issues.mappings().all()],
        'initiativeLinks': [{'initiativeId': link['initiative_id'], 'projectId': link['project_id'], 'createdAt': link['created_at'], 'initiative': {'id': link['id'], 'name': link['name']}} for link in initiatives.mappings().all()],
        'resources': [{'id': resource['id'], 'workspaceId': resource['workspace_id'], 'projectId': resource['project_id'], 'createdById': resource['created_by'], 'label': resource['label'], 'url': resource['url'], 'createdAt': resource['created_at'], 'updatedAt': resource['updated_at'], 'createdBy': {'id': resource['creator_id_value'], 'name': resource['creator_name'], 'avatarUrl': resource['creator_avatar_url']}} for resource in resources.mappings().all()],
    } | ({'favorites': [{'userId': user_id}] if row['is_favorite'] else []} if include_favorites else {})


@router.get('')
async def list_projects(workspaceId: str = Query(min_length=1), teamId: str | None = None, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    if teamId:
        await _team_access(db, workspaceId, teamId, user['id'])
        result = await db.execute(text('SELECT id FROM projects WHERE workspace_id = :workspace_id AND team_id = :team_id AND archived_at IS NULL ORDER BY created_at DESC'), {'workspace_id': workspaceId, 'team_id': teamId})
    else:
        result = await db.execute(text('SELECT id FROM projects WHERE workspace_id = :workspace_id AND archived_at IS NULL ORDER BY created_at DESC'), {'workspace_id': workspaceId})
    return {'data': [await _project(db, row['id'], workspaceId, user['id']) for row in result.mappings().all()]}


@router.post('')
async def create_project(payload: CreateProjectInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, payload.workspaceId, user['id'])
    if payload.teamId: await _team_access(db, payload.workspaceId, payload.teamId, user['id'])
    template = None
    if payload.templateId:
        template = (await db.execute(text('SELECT * FROM project_templates WHERE id = :id AND workspace_id = :workspace_id'), {'id': payload.templateId, 'workspace_id': payload.workspaceId})).mappings().first()
        if template is None: raise ApiError(404, 'Project template not found.', 'Not Found')
    template_config = template['config'] if template and isinstance(template['config'], dict) else {}
    description = payload.description if payload.description is not None else (template['description'] if template else None)
    project_type = payload.type or (template['type'] if template else 'GENERAL')
    status = template_config.get('status', 'in-progress')
    priority = template_config.get('priority', 'none')
    health = template_config.get('health', 'no-update')
    project_id, now = _cuid(), _utcnow()
    try:
        await db.execute(text('''INSERT INTO projects (id, workspace_id, team_id, name, identifier, description, type, status, priority, health, created_at, updated_at) VALUES (:id, :workspace_id, :team_id, :name, :identifier, :description, :type, :status, :priority, :health, :now, :now)'''), {'id': project_id, 'workspace_id': payload.workspaceId, 'team_id': payload.teamId, 'name': payload.name.strip(), 'identifier': payload.identifier.strip().upper(), 'description': description, 'type': project_type, 'status': status, 'priority': priority, 'health': health, 'now': now})
        await db.execute(text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.created', CAST(:data AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': payload.workspaceId, 'project_id': project_id, 'actor_id': user['id'], 'data': '{"source":"python"}', 'now': now})
        await db.commit()
    except IntegrityError as error:
        await db.rollback(); raise ApiError(409, 'A project with this identifier already exists.', 'Conflict') from error
    return {'data': await _project(db, project_id, payload.workspaceId, user['id'], include_favorites=False)}


@public_router.get('/updates')
async def workspace_updates_public(workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    return await _workspace_updates(workspaceId, user, db)


@router.get('/{project_id}')
async def get_project(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _workspace_access(db, workspaceId, user['id'])
    return {'data': await _project(db, project_id, workspaceId, user['id'])}


@router.patch('/{project_id}')
async def update_project(project_id: str, payload: UpdateProjectInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    current = await _project(db, project_id, workspaceId, user['id'])
    values = payload.model_dump(exclude_unset=True)
    if values.get('leadId'):
        lead = await db.execute(text("SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"), {'workspace_id': workspaceId, 'user_id': values['leadId']})
        if lead.scalar_one_or_none() is None: raise ApiError(404, 'Project lead must be an active workspace member.', 'Not Found')
    if values.get('teamId'): await _team_access(db, workspaceId, values['teamId'], user['id'])
    if values.get('status'):
        await _ensure_circle_project_statuses(db, workspaceId)
        status = await db.execute(text('SELECT 1 FROM project_statuses WHERE workspace_id = :workspace_id AND name = :name'), {'workspace_id': workspaceId, 'name': values['status']})
        if status.scalar_one_or_none() is None: raise ApiError(404, 'Project status is not configured in this workspace.', 'Not Found')
    label_ids = values.pop('labelIds', None)
    if label_ids is not None:
        ids = list(set(label_ids))
        if ids:
            labels = await db.execute(text('SELECT COUNT(*) FROM project_labels WHERE workspace_id = :workspace_id AND id = ANY(:ids)'), {'workspace_id': workspaceId, 'ids': ids})
            if labels.scalar_one() != len(ids): raise ApiError(404, 'One or more project labels are not available in this workspace.', 'Not Found')
    column_map = {'name':'name','description':'description','status':'status','priority':'priority','health':'health','leadId':'lead_id','teamId':'team_id','startDate':'start_date','targetDate':'target_date','type':'type'}
    params, sets = {'id': project_id, 'now': _utcnow()}, []
    for key, column in column_map.items():
        if key in values:
            value = _date(values[key]) if key in {'startDate','targetDate'} else values[key]
            params[key] = value.strip() if key in {'name','description'} and isinstance(value, str) else value; sets.append(f'{column} = :{key}')
    if sets: await db.execute(text(f"UPDATE projects SET {', '.join(sets)}, updated_at = :now WHERE id = :id"), params)
    if label_ids is not None:
        await db.execute(text('DELETE FROM project_label_links WHERE project_id = :project_id'), {'project_id': project_id})
        for label_id in set(label_ids): await db.execute(text('INSERT INTO project_label_links (project_id, label_id) VALUES (:project_id, :label_id)'), {'project_id': project_id, 'label_id': label_id})
    await db.execute(text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.updated', CAST('{}' AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': workspaceId, 'project_id': project_id, 'actor_id': user['id'], 'now': _utcnow()})
    await db.commit()
    return {'data': await _project(db, project_id, workspaceId, user['id'])}


@router.delete('/{project_id}')
async def archive_project(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _project(db, project_id, workspaceId, user['id']); now = _utcnow()
    await db.execute(text('UPDATE issues SET archived_at = :now, updated_at = :now WHERE project_id = :project_id AND workspace_id = :workspace_id AND archived_at IS NULL'), {'project_id': project_id, 'workspace_id': workspaceId, 'now': now})
    await db.execute(text('UPDATE projects SET archived_at = :now, updated_at = :now WHERE id = :project_id AND workspace_id = :workspace_id'), {'project_id': project_id, 'workspace_id': workspaceId, 'now': now})
    await db.commit()
    return {'data': {'id': project_id, 'archivedAt': now}}


@router.get('/{project_id}/activity')
async def project_activity(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _project(db, project_id, workspaceId, user['id'])
    return {'data': await _activity(db, project_id)}


@router.get('/{project_id}/issues')
async def project_issues(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    return {'data': (await _project(db, project_id, workspaceId, user['id']))['issues']}


@router.get('/{project_id}/custom-fields')
async def project_custom_fields(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _project(db, project_id, workspaceId, user['id'])
    return {'data': await _project_custom_fields(db, project_id, workspaceId)}


@router.patch('/{project_id}/custom-fields/{field_id}')
async def update_project_custom_field(project_id: str, field_id: str, payload: ProjectCustomFieldValueInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _project(db, project_id, payload.workspaceId, user['id'])
    result = await db.execute(text('SELECT * FROM project_custom_fields WHERE id = :id AND workspace_id = :workspace_id'), {'id': field_id, 'workspace_id': payload.workspaceId})
    field = result.mappings().first()
    if not field:
        raise ApiError(404, 'Project custom field not found.', 'Not Found')
    value = _custom_field_value(field, payload.value)
    now = _utcnow()
    await db.execute(
        text('''INSERT INTO project_custom_field_values (project_id, field_id, value, created_at, updated_at)
                VALUES (:project_id, :field_id, CAST(:value AS jsonb), :now, :now)
                ON CONFLICT (project_id, field_id) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at'''),
        {'project_id': project_id, 'field_id': field_id, 'value': json.dumps(value), 'now': now},
    )
    await db.execute(text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.custom-field.updated', CAST(:data AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': payload.workspaceId, 'project_id': project_id, 'actor_id': user['id'], 'data': json.dumps({'fieldId': field_id}), 'now': now})
    await db.commit()
    return {'data': {**_custom_field(field), 'value': value}}


@router.patch('/{project_id}/members')
async def update_members(project_id: str, payload: ProjectMembersInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _project(db, project_id, payload.workspaceId, user['id'])
    member_ids = list(set(payload.userIds))
    if len(member_ids) != len(payload.userIds):
        raise ApiError(400, 'Project members must be unique.', 'Bad Request')
    if member_ids:
        active = await db.execute(text("SELECT COUNT(*) FROM workspace_members WHERE workspace_id = :workspace_id AND status = 'ACTIVE' AND user_id = ANY(:user_ids)"), {'workspace_id': payload.workspaceId, 'user_ids': member_ids})
        if active.scalar_one() != len(member_ids):
            raise ApiError(400, 'Project members must be active workspace members.', 'Bad Request')
    now = _utcnow()
    await db.execute(text('DELETE FROM project_members WHERE project_id = :project_id'), {'project_id': project_id})
    for member_id in member_ids:
        await db.execute(text('INSERT INTO project_members (project_id, user_id, created_at) VALUES (:project_id, :user_id, :now)'), {'project_id': project_id, 'user_id': member_id, 'now': now})
    await db.execute(text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.members.updated', CAST(:data AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': payload.workspaceId, 'project_id': project_id, 'actor_id': user['id'], 'data': json.dumps({'memberIds': member_ids}), 'now': now})
    await db.commit()
    return {'data': await _members(db, project_id)}


@router.get('/{project_id}/subscription')
async def subscription(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await _project(db, project_id, workspaceId, user['id'])
    result = await db.execute(text('SELECT created_at FROM project_subscriptions WHERE project_id = :project_id AND user_id = :user_id'), {'project_id': project_id, 'user_id': user['id']})
    created_at = result.scalar_one_or_none()
    return {'data': {'subscribed': created_at is not None, 'subscribedAt': created_at}}


@router.post('/{project_id}/subscription')
async def subscribe(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await _project(db, project_id, workspaceId, user['id'])
    now = _utcnow()
    await db.execute(text('INSERT INTO project_subscriptions (project_id, user_id, created_at) VALUES (:project_id, :user_id, :now) ON CONFLICT (project_id, user_id) DO NOTHING'), {'project_id': project_id, 'user_id': user['id'], 'now': now})
    await db.commit()
    result = await db.execute(text('SELECT created_at FROM project_subscriptions WHERE project_id = :project_id AND user_id = :user_id'), {'project_id': project_id, 'user_id': user['id']})
    return {'data': {'subscribed': True, 'subscribedAt': result.scalar_one()}}


@router.delete('/{project_id}/subscription')
async def unsubscribe(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await _project(db, project_id, workspaceId, user['id'])
    await db.execute(text('DELETE FROM project_subscriptions WHERE project_id = :project_id AND user_id = :user_id'), {'project_id': project_id, 'user_id': user['id']})
    await db.commit()
    return {'data': {'subscribed': False, 'subscribedAt': None}}


@router.post('/{project_id}/favorite')
async def favorite(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await _project(db, project_id, workspaceId, user['id'])
    now = _utcnow()
    await db.execute(text('INSERT INTO project_favorites (project_id, user_id, created_at) VALUES (:project_id, :user_id, :now) ON CONFLICT (project_id, user_id) DO NOTHING'), {'project_id': project_id, 'user_id': user['id'], 'now': now})
    await db.commit()
    result = await db.execute(text('SELECT created_at FROM project_favorites WHERE project_id = :project_id AND user_id = :user_id'), {'project_id': project_id, 'user_id': user['id']})
    return {'data': {'favorite': True, 'favoritedAt': result.scalar_one()}}


@router.delete('/{project_id}/favorite')
async def unfavorite(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    await _project(db, project_id, workspaceId, user['id'])
    await db.execute(text('DELETE FROM project_favorites WHERE project_id = :project_id AND user_id = :user_id'), {'project_id': project_id, 'user_id': user['id']})
    await db.commit()
    return {'data': {'favorite': False, 'favoritedAt': None}}


def _milestone(row: Any) -> dict[str, Any]:
    return {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'projectId': row['project_id'],
        'title': row['title'], 'description': row['description'], 'targetDate': row['target_date'],
        'position': row['position'], 'completedAt': row['completed_at'],
        'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
    }


@router.get('/{project_id}/milestones')
async def list_milestones(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _project(db, project_id, workspaceId, user['id'])
    result = await db.execute(text('SELECT * FROM project_milestones WHERE project_id = :project_id AND workspace_id = :workspace_id ORDER BY position, target_date'), {'project_id': project_id, 'workspace_id': workspaceId})
    return {'data': [_milestone(row) for row in result.mappings().all()]}


@router.post('/{project_id}/milestones')
async def create_milestone(project_id: str, payload: MilestoneInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _project(db, project_id, payload.workspaceId, user['id'])
    milestone_id, now = _cuid(), _utcnow()
    await db.execute(text('''INSERT INTO project_milestones (id, workspace_id, project_id, title, description, target_date, position, created_at, updated_at) VALUES (:id, :workspace_id, :project_id, :title, :description, :target_date, :position, :now, :now)'''), {'id': milestone_id, 'workspace_id': payload.workspaceId, 'project_id': project_id, 'title': payload.title.strip(), 'description': payload.description, 'target_date': _date(payload.targetDate), 'position': payload.position or 0, 'now': now})
    await db.commit()
    result = await db.execute(text('SELECT * FROM project_milestones WHERE id = :id'), {'id': milestone_id})
    return {'data': _milestone(result.mappings().one())}


@router.patch('/{project_id}/milestones/{milestone_id}')
async def update_milestone(project_id: str, milestone_id: str, payload: UpdateMilestoneInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _project(db, project_id, workspaceId, user['id'])
    exists = await db.execute(text('SELECT 1 FROM project_milestones WHERE id = :id AND project_id = :project_id AND workspace_id = :workspace_id'), {'id': milestone_id, 'project_id': project_id, 'workspace_id': workspaceId})
    if exists.scalar_one_or_none() is None: raise ApiError(404, 'Project milestone not found.', 'Not Found')
    values, sets, params = payload.model_dump(exclude_unset=True), [], {'id': milestone_id, 'now': _utcnow()}
    for key, column in {'title': 'title', 'description': 'description', 'position': 'position'}.items():
        if key in values:
            params[key] = values[key].strip() if key == 'title' and isinstance(values[key], str) else values[key]; sets.append(f'{column} = :{key}')
    if 'targetDate' in values: params['targetDate'] = _date(values['targetDate']); sets.append('target_date = :targetDate')
    if 'completed' in values: params['completedAt'] = _utcnow() if values['completed'] else None; sets.append('completed_at = :completedAt')
    if sets: await db.execute(text(f"UPDATE project_milestones SET {', '.join(sets)}, updated_at = :now WHERE id = :id"), params); await db.commit()
    result = await db.execute(text('SELECT * FROM project_milestones WHERE id = :id'), {'id': milestone_id})
    return {'data': _milestone(result.mappings().one())}


@router.delete('/{project_id}/milestones/{milestone_id}')
async def remove_milestone(project_id: str, milestone_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _project(db, project_id, workspaceId, user['id'])
    deleted = await db.execute(text('DELETE FROM project_milestones WHERE id = :id AND project_id = :project_id AND workspace_id = :workspace_id RETURNING id'), {'id': milestone_id, 'project_id': project_id, 'workspace_id': workspaceId})
    if deleted.scalar_one_or_none() is None: raise ApiError(404, 'Project milestone not found.', 'Not Found')
    await db.commit()
    return {'data': {'id': milestone_id, 'deleted': True}}


def _project_update(row: Any, *, include_project: bool = False) -> dict[str, Any]:
    value = {
        'id': row['id'], 'workspaceId': row['workspace_id'], 'projectId': row['project_id'],
        'authorId': row['author_id'], 'body': row['body'], 'kind': row['kind'], 'health': row['health'],
        'createdAt': row['created_at'], 'updatedAt': row['updated_at'],
        'author': {'id': row['author_id_value'], 'name': row['author_name'], 'avatarUrl': row['author_avatar_url']},
        'attachments': [],
    }
    if include_project:
        value['project'] = {'id': row['project_id_value'], 'name': row['project_name'], 'identifier': row['project_identifier']}
    return value


async def _workspace_updates(workspaceId: str, user: Any, db: AsyncSession) -> dict[str, list[dict[str, Any]]]:
    await _workspace_access(db, workspaceId, user['id'])
    rows = await db.execute(text('''SELECT pu.*, p.id AS project_id_value, p.name AS project_name, p.identifier AS project_identifier,
                                     u.id AS author_id_value, u.name AS author_name, u.avatar_url AS author_avatar_url
                              FROM project_updates pu JOIN projects p ON p.id = pu.project_id
                              JOIN users u ON u.id = pu.author_id
                              WHERE pu.workspace_id = :workspace_id AND p.archived_at IS NULL
                              ORDER BY pu.created_at DESC LIMIT 100'''), {'workspace_id': workspaceId})
    return {'data': [_project_update(row, include_project=True) for row in rows.mappings().all()]}


@router.get('/{project_id}/updates')
@public_router.get('/{project_id}/updates')
async def list_updates(project_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    await _project(db, project_id, workspaceId, user['id'])
    result = await db.execute(text('''SELECT pu.*, u.id AS author_id_value, u.name AS author_name, u.avatar_url AS author_avatar_url FROM project_updates pu JOIN users u ON u.id = pu.author_id WHERE pu.project_id = :project_id AND pu.workspace_id = :workspace_id ORDER BY pu.created_at DESC LIMIT 25'''), {'project_id': project_id, 'workspace_id': workspaceId})
    return {'data': [_project_update(row) for row in result.mappings().all()]}


@router.post('/{project_id}/updates')
@public_router.post('/{project_id}/updates')
async def create_update(project_id: str, payload: ProjectUpdateInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    project = await _project(db, project_id, payload.workspaceId, user['id']); body = payload.body.strip()
    if not body: raise ApiError(400, 'Project update cannot be empty.', 'Bad Request')
    update_id, now, kind = _cuid(), _utcnow(), payload.kind or 'update'
    await db.execute(text('''INSERT INTO project_updates (id, workspace_id, project_id, author_id, body, kind, health, created_at, updated_at) VALUES (:id, :workspace_id, :project_id, :author_id, :body, :kind, :health, :now, :now)'''), {'id': update_id, 'workspace_id': payload.workspaceId, 'project_id': project_id, 'author_id': user['id'], 'body': body, 'kind': kind, 'health': None if kind == 'comment' else (payload.health or 'on-track'), 'now': now})
    if kind != 'comment' and payload.health: await db.execute(text('UPDATE projects SET health = :health, updated_at = :now WHERE id = :id'), {'id': project_id, 'health': payload.health, 'now': now})
    await db.execute(text('INSERT INTO project_subscriptions (project_id, user_id, created_at) VALUES (:project_id, :user_id, :now) ON CONFLICT (project_id, user_id) DO NOTHING'), {'project_id': project_id, 'user_id': user['id'], 'now': now})
    await db.execute(text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.update.created', CAST(:data AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': payload.workspaceId, 'project_id': project_id, 'actor_id': user['id'], 'data': json.dumps({'updateId': update_id, 'preview': body[:200]}), 'now': now})
    await db.commit()
    return {'data': {'id': update_id, 'workspaceId': payload.workspaceId, 'projectId': project_id, 'authorId': user['id'], 'body': body, 'kind': kind, 'health': None if kind == 'comment' else (payload.health or 'on-track'), 'createdAt': now, 'updatedAt': now, 'author': {'id': user['id'], 'name': user['name'], 'avatarUrl': user['avatar_url']}, 'attachments': []}}


@router.post('/{project_id}/resources')
async def create_resource(project_id: str, payload: ProjectResourceInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    await _project(db, project_id, payload.workspaceId, user['id'])
    resource_id, now, label, resource_url = _cuid(), _utcnow(), payload.label.strip(), _url(payload.url)
    await db.execute(text('''INSERT INTO project_resources (id, workspace_id, project_id, created_by, label, url, created_at, updated_at) VALUES (:id, :workspace_id, :project_id, :created_by, :label, :url, :now, :now)'''), {'id': resource_id, 'workspace_id': payload.workspaceId, 'project_id': project_id, 'created_by': user['id'], 'label': label, 'url': resource_url, 'now': now})
    await db.execute(text("INSERT INTO activities (id, workspace_id, project_id, actor_id, type, data, created_at) VALUES (:id, :workspace_id, :project_id, :actor_id, 'project.resource.created', CAST(:data AS jsonb), :now)"), {'id': _cuid(), 'workspace_id': payload.workspaceId, 'project_id': project_id, 'actor_id': user['id'], 'data': json.dumps({'resourceId': resource_id, 'label': label, 'url': resource_url}), 'now': now})
    await db.commit()
    return {'data': {'id': resource_id, 'workspaceId': payload.workspaceId, 'projectId': project_id, 'createdById': user['id'], 'label': label, 'url': resource_url, 'createdAt': now, 'updatedAt': now, 'createdBy': {'id': user['id'], 'name': user['name'], 'avatarUrl': user['avatar_url']}}}


# Public cutover: only endpoints consumed by the unchanged Project UI whose
# response contracts are now audited. Issue detail, project settings and any
# future route not listed here deliberately remain on the legacy facade.
def _public_project_id(project_suffix: str) -> str:
    """Restore the CUID prefix consumed by the static-safe public route.

    The public routes use ``/c{project_suffix}`` so they do not shadow
    settings endpoints such as ``/updates``.  Project CUIDs always begin with
    ``c``; the database helper still expects the complete identifier.
    """
    return f'c{project_suffix}'


@public_router.get('')
async def public_list_projects(workspaceId: str = Query(min_length=1), teamId: str | None = None, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    return await list_projects(workspaceId, teamId, user, db)


@public_router.post('')
async def public_create_project(payload: CreateProjectInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return await create_project(payload, user, db)


@public_router.get('/c{project_suffix}')
async def public_get_project(project_suffix: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return await get_project(_public_project_id(project_suffix), workspaceId, user, db)


@public_router.patch('/c{project_suffix}')
async def public_update_project(project_suffix: str, payload: UpdateProjectInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return await update_project(_public_project_id(project_suffix), payload, workspaceId, user, db)


@public_router.delete('/c{project_suffix}')
async def public_archive_project(project_suffix: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return await archive_project(_public_project_id(project_suffix), workspaceId, user, db)


@public_router.patch('/c{project_suffix}/members')
async def public_update_members(project_suffix: str, payload: ProjectMembersInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    return await update_members(_public_project_id(project_suffix), payload, user, db)


@public_router.get('/c{project_suffix}/custom-fields')
async def public_project_custom_fields(project_suffix: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    return await project_custom_fields(_public_project_id(project_suffix), workspaceId, user, db)


@public_router.patch('/c{project_suffix}/custom-fields/{field_id}')
async def public_update_project_custom_field(project_suffix: str, field_id: str, payload: ProjectCustomFieldValueInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return await update_project_custom_field(_public_project_id(project_suffix), field_id, payload, user, db)


@public_router.post('/c{project_suffix}/resources')
async def public_create_resource(project_suffix: str, payload: ProjectResourceInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return await create_resource(_public_project_id(project_suffix), payload, user, db)


@public_router.get('/c{project_suffix}/milestones')
async def public_list_milestones(project_suffix: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, list[dict[str, Any]]]:
    return await list_milestones(_public_project_id(project_suffix), workspaceId, user, db)


@public_router.post('/c{project_suffix}/milestones')
async def public_create_milestone(project_suffix: str, payload: MilestoneInput, user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return await create_milestone(_public_project_id(project_suffix), payload, user, db)


@public_router.patch('/c{project_suffix}/milestones/{milestone_id}')
async def public_update_milestone(project_suffix: str, milestone_id: str, payload: UpdateMilestoneInput, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return await update_milestone(_public_project_id(project_suffix), milestone_id, payload, workspaceId, user, db)


@public_router.delete('/c{project_suffix}/milestones/{milestone_id}')
async def public_remove_milestone(project_suffix: str, milestone_id: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, dict[str, Any]]:
    return await remove_milestone(_public_project_id(project_suffix), milestone_id, workspaceId, user, db)


@public_router.post('/c{project_suffix}/favorite')
async def public_favorite(project_suffix: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    return await favorite(_public_project_id(project_suffix), workspaceId, user, db)


@public_router.delete('/c{project_suffix}/favorite')
async def public_unfavorite(project_suffix: str, workspaceId: str = Query(min_length=1), user: Any = Depends(current_user), db: AsyncSession = Depends(get_session)) -> dict[str, Any]:
    return await unfavorite(_public_project_id(project_suffix), workspaceId, user, db)
