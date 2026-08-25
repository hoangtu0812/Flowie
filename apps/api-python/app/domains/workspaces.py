from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..db.session import get_session
from .auth import current_user

router = APIRouter(prefix='/api/v1/workspaces', tags=['workspaces'])


@router.get('/me')
async def mine(
    user: object = Depends(current_user), db: AsyncSession = Depends(get_session)
) -> dict[str, object]:
    result = await db.execute(
        text(
            '''
            SELECT
                wm.id AS member_id, wm.workspace_id, wm.user_id, wm.status, wm.role,
                wm.joined_at, wm.invited_by, wm.created_at AS member_created_at,
                wm.updated_at AS member_updated_at,
                w.id AS workspace_id_value, w.organization_id, w.name AS workspace_name,
                w.slug AS workspace_slug, w.description AS workspace_description,
                w.timezone AS workspace_timezone, w.project_display_defaults,
                w.issue_display_defaults, w.issue_insight_defaults,
                w.created_at AS workspace_created_at, w.updated_at AS workspace_updated_at,
                o.id AS organization_id_value, o.name AS organization_name, o.slug AS organization_slug,
                o.logo_url AS organization_logo_url, o.owner_id AS organization_owner_id,
                o.created_at AS organization_created_at, o.updated_at AS organization_updated_at
            FROM workspace_members AS wm
            INNER JOIN workspaces AS w ON w.id = wm.workspace_id
            INNER JOIN organizations AS o ON o.id = w.organization_id
            WHERE wm.user_id = :user_id AND wm.status = 'ACTIVE'
            ORDER BY wm.created_at ASC
            '''
        ),
        {'user_id': user['id']},
    )
    return {'data': [_membership(dict(row)) for row in result.mappings().all()]}


def _membership(row: dict[str, object]) -> dict[str, object]:
    return {
        'id': row['member_id'],
        'workspaceId': row['workspace_id'],
        'userId': row['user_id'],
        'status': row['status'],
        'role': row['role'],
        'joinedAt': row['joined_at'],
        'invitedById': row['invited_by'],
        'createdAt': row['member_created_at'],
        'updatedAt': row['member_updated_at'],
        'workspace': {
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
        },
    }
