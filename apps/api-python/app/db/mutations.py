from __future__ import annotations

from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession


async def commit_mutation[T](db: AsyncSession, operation: Callable[[], Awaitable[T]]) -> T:
    """The HTTP adapter owns commit; shared services only stage database writes."""
    try:
        result = await operation()
        await db.commit()
        return result
    except BaseException:
        await db.rollback()
        raise
