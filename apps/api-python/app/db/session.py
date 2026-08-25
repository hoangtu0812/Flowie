from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from ..core.config import Settings


def create_session_factory(settings: Settings) -> tuple[async_sessionmaker[AsyncSession], object]:
    engine = create_async_engine(settings.database_url, pool_pre_ping=True)
    return async_sessionmaker(engine, expire_on_commit=False), engine


async def get_session(request: Request) -> AsyncIterator[AsyncSession]:
    factory: async_sessionmaker[AsyncSession] = request.app.state.session_factory
    async with factory() as session:
        yield session
