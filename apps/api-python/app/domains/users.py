from __future__ import annotations

from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import current_user

router = APIRouter(prefix='/api/v1/users', tags=['users'])


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    username: str | None = Field(default=None, max_length=48)
    title: str | None = Field(default=None, max_length=120)
    avatarUrl: str | None = Field(default=None, max_length=2048)
    timezone: str | None = Field(default=None, max_length=100)


def _profile(row: object) -> dict[str, object]:
    return {
        'id': row['id'],
        'name': row['name'],
        'email': row['email'],
        'username': row['username'],
        'title': row['title'],
        'timezone': row['timezone'],
        'avatarUrl': row['avatar_url'],
        'createdAt': row['created_at'],
    }


@router.get('/me')
async def me(user: object = Depends(current_user)) -> dict[str, object]:
    return {'data': _profile(user)}


@router.patch('/me')
async def update_me(
    payload: ProfileUpdate,
    user: object = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, object]:
    values = payload.model_dump(exclude_unset=True)
    if not values:
        return {'data': _profile(user)}
    if 'timezone' in values and values['timezone'] is not None:
        try:
            ZoneInfo(values['timezone'])
        except ZoneInfoNotFoundError as error:
            raise ApiError(400, 'Timezone is invalid.', 'Bad Request') from error

    columns = {'name': 'name', 'username': 'username', 'title': 'title', 'avatarUrl': 'avatar_url', 'timezone': 'timezone'}
    params: dict[str, object] = {'id': user['id']}
    updates: list[str] = []
    for field, column in columns.items():
        if field not in values:
            continue
        value = values[field]
        if field in {'name', 'username', 'title', 'avatarUrl'} and value is not None:
            value = value.strip()
        if field in {'username', 'title', 'avatarUrl'} and value == '':
            value = None
        params[field] = value
        updates.append(f'{column} = :{field}')
    if not updates:
        return {'data': _profile(user)}
    updates.append('updated_at = CURRENT_TIMESTAMP')
    try:
        result = await db.execute(
            text(
                f'''UPDATE users SET {', '.join(updates)} WHERE id = :id
                    RETURNING id, name, email, username, title, timezone, avatar_url, created_at'''
            ),
            params,
        )
        await db.commit()
    except Exception as error:
        await db.rollback()
        raise ApiError(409, 'The profile could not be updated.', 'Conflict') from error
    return {'data': _profile(result.mappings().one())}
