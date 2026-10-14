from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.errors import ApiError


async def mention_options(db: AsyncSession, issue: dict) -> list[dict]:
    rows = (
        await db.execute(
            text("""SELECT u.id,u.name,u.avatar_url AS "avatarUrl"
        FROM team_members tm JOIN users u ON u.id=tm.user_id JOIN workspace_members wm
        ON wm.user_id=tm.user_id AND wm.workspace_id=:workspace WHERE tm.team_id=:team
        AND wm.status='ACTIVE' AND u.status='ACTIVE' ORDER BY u.name,u.id"""),
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
