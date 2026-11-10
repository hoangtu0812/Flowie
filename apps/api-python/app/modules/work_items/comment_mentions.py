from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from .queries import (
    MENTION_OPTIONS_SELECT_TEAM_MEMBERS,
)


async def mention_options(db: AsyncSession, issue: dict) -> list[dict]:
    rows = (
        await db.execute(
            MENTION_OPTIONS_SELECT_TEAM_MEMBERS,
            {"workspace": issue["workspaceId"], "team": issue["teamId"]},
        )
    ).mappings()
    return [dict(row) for row in rows]


async def validate_mentions(db: AsyncSession, issue: dict, ids: list[str]) -> list[str]:
    unique = sorted(set(ids))
    if not unique:
        return []
    allowed = {row["id"] for row in await mention_options(db, issue)}
    if set(unique) - allowed:
        raise ApiError(
            400,
            "Mentions must be active members who can access this issue.",
            "Bad Request",
        )
    return unique
