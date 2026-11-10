"""A throwaway organisation, workspace and team on the real test database.

Yields the bootstrap ids, the owner, and a function that adds an ACTIVE member;
everything it created is deleted on exit, users included, so a failing test
leaves nothing behind for the next one.
VI: Một organisation, workspace và team dùng một lần trên database test thật.
VI: Trả về các id bootstrap, chủ sở hữu, và một hàm thêm thành viên ACTIVE; mọi
VI: thứ nó tạo đều bị xoá khi thoát, kể cả user, để một test hỏng không để lại
VI: gì cho test sau.
"""
import os
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.clock import _utcnow
from app.core.config import _async_database_url
from app.core.identifiers import _cuid
from app.modules.identity.auth import create_workspace_bootstrap


async def _user(db, users, name):
    user = {"id": _cuid(), "name": name}
    now = _utcnow()
    await db.execute(
        text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
        {**user, "email": user["id"] + "@example.test", "now": now},
    )
    users.append(user["id"])
    return user


@asynccontextmanager
async def seeded_workspace():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    users, seeds = [], []

    async def member(db, workspace, *, role="MEMBER", team=None, name="Member"):
        user = await _user(db, users, name)
        await db.execute(
            text("""INSERT INTO workspace_members(id,workspace_id,user_id,status,role,created_at,updated_at)
            VALUES (:id,:workspace,:user,'ACTIVE',:role,:now,:now)"""),
            {"id": _cuid(), "workspace": workspace, "user": user["id"], "role": role, "now": _utcnow()},
        )
        if team:
            await db.execute(
                text("INSERT INTO team_members(team_id,user_id,role) VALUES (:team,:user,'MEMBER')"),
                {"team": team, "user": user["id"]},
            )
        return user

    async def workspace(db, name="Owner"):
        owner = await _user(db, users, name)
        seed = await create_workspace_bootstrap(
            db, user_id=owner["id"], organization_name="Fixture", workspace_name=_cuid(), now=_utcnow()
        )
        seeds.append(seed)
        return seed, owner

    try:
        yield factory, workspace, member
    finally:
        async with factory() as db:
            for seed in seeds:
                await db.execute(text("DELETE FROM organizations WHERE id=:id"), {"id": seed["organization_id"]})
            if users:
                await db.execute(text("DELETE FROM users WHERE id = ANY(:ids)"), {"ids": users})
            await db.commit()
        await engine.dispose()
