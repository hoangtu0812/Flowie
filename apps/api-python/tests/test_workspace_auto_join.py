import asyncio
import json
import os
from types import SimpleNamespace

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import _async_database_url
from app.core.errors import ApiError
from app.domains.auth import _cuid, _upsert_microsoft_user, _utcnow, create_workspace_bootstrap
from app.domains.workspaces import AutoJoinInput, auto_join_status, leave, remove_member, update_auto_join
from app.services.microsoft_identity import MicrosoftProfile
from tests.document_review_support import add_member
from tests.test_service_desk_asks import add_project


TENANT = "11111111-1111-1111-1111-111111111111"
OTHER_TENANT = "22222222-2222-2222-2222-222222222222"


def request(*, tenant=TENANT):
    settings = SimpleNamespace(
        azure_ad_tenant_id=tenant,
        azure_ad_client_id="client" if tenant else "",
        azure_ad_client_secret="secret" if tenant else "",
        azure_ad_redirect_uri="https://poc.test/callback" if tenant else "",
    )
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(settings=settings)))


def profile(tenant=TENANT, email=None):
    unique = _cuid()
    return MicrosoftProfile(object_id=unique, tenant_id=tenant, email=email or f"{unique}@example.test", name="Company Staff")


@pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database not configured"
)
def test_company_accounts_join_only_when_allowed():
    asyncio.run(verify_join())


async def verify_join():
    engine = create_async_engine(_async_database_url(os.environ["MCP_TEST_DATABASE_URL"]))
    factory = async_sessionmaker(engine, expire_on_commit=False)
    settings = SimpleNamespace(admin_email="nobody@example.test")

    async def sign_in(identity):
        async with factory() as session:
            return await _upsert_microsoft_user(session, identity, timezone_name="UTC", settings=settings)

    try:
        async with factory() as db:
            now = _utcnow()
            owner = {"id": _cuid(), "name": "Owner"}
            await db.execute(
                text("INSERT INTO users(id,name,email,status,created_at,updated_at) VALUES (:id,:name,:email,'ACTIVE',:now,:now)"),
                {**owner, "email": _cuid() + "@example.test", "now": now},
            )
            seed = await create_workspace_bootstrap(db, user_id=owner["id"], organization_name="Desk", workspace_name=_cuid(), now=now)
            workspace, team = seed["workspace_id"], seed["team_id"]
            member = await add_member(db, workspace, None, name="Member")
            await db.commit()

            async def memberships(user_id):
                result = await db.execute(
                    text("SELECT workspace_id, role, status FROM workspace_members WHERE user_id = :id"), {"id": user_id}
                )
                await db.commit()
                return [dict(row) for row in result.mappings()]

            async def is_member(user_id):
                return any(row["workspace_id"] == workspace for row in await memberships(user_id))

            async def audits(action):
                result = await db.execute(
                    text("SELECT metadata FROM audit_logs WHERE workspace_id = :id AND action = :action"), {"id": workspace, "action": action}
                )
                await db.commit()
                return [row[0] if isinstance(row[0], dict) else json.loads(row[0]) for row in result]

            # Off by default: sign-in behaves as it did, with a personal workspace.
            # VI: Mặc định tắt: đăng nhập giữ nguyên, có workspace cá nhân.
            before = await sign_in(profile())
            assert await is_member(before) is False
            assert (await memberships(before))[0]["role"] == "OWNER"

            # Only people who manage the workspace can see or change the setting.
            # VI: Chỉ người quản lý workspace mới xem hoặc đổi được cài đặt.
            for call in (
                auto_join_status(workspace, request(), member, db),
                update_auto_join(workspace, AutoJoinInput(enabled=True), request(), member, db),
            ):
                with pytest.raises(ApiError) as error:
                    await call
                assert error.value.status_code == 403
            with pytest.raises(ApiError) as error:
                await update_auto_join(workspace, AutoJoinInput(enabled=True), request(tenant=""), owner, db)
            assert error.value.status_code == 409
            status = (await auto_join_status(workspace, request(tenant=""), owner, db))["data"]
            assert status["available"] is False and status["enabled"] is False

            # The warning counts data that everyone would read.
            # VI: Cảnh báo đếm dữ liệu mà mọi người sẽ đọc được.
            await add_project(db, workspace, None, enabled=False)
            await add_project(db, workspace, team, enabled=False)
            status = (await auto_join_status(workspace, request(), owner, db))["data"]
            assert status["teamlessProjects"] == 1

            await update_auto_join(workspace, AutoJoinInput(enabled=True), request(), owner, db)
            assert (await auto_join_status(workspace, request(), owner, db))["data"]["enabled"] is True
            assert await audits("workspace.auto_join.changed") == [{"enabled": True}]

            # A new account joins as a member of no team, with no personal workspace.
            # VI: Tài khoản mới vào với vai trò member, không thuộc team, không có workspace cá nhân.
            joined = await sign_in(profile(TENANT.upper()))
            rows = await memberships(joined)
            assert rows == [{"workspace_id": workspace, "role": "MEMBER", "status": "ACTIVE"}]
            teams = await db.execute(text("SELECT COUNT(*) FROM team_members WHERE user_id = :id"), {"id": joined})
            assert teams.scalar_one() == 0
            await db.commit()
            assert len(await audits("workspace.member.auto_joined")) == 1

            # Another tenant stays out even with a company-looking email.
            # VI: Tenant khác vẫn ở ngoài dù email giống email công ty.
            outsider = await sign_in(profile(OTHER_TENANT))
            assert await is_member(outsider) is False

            # An existing account joins on its next sign-in, and only once.
            # VI: Tài khoản đã có sẽ vào ở lần đăng nhập sau, và chỉ một lần.
            identity = profile()
            await update_auto_join(workspace, AutoJoinInput(enabled=False), request(), owner, db)
            existing = await sign_in(identity)
            assert await is_member(existing) is False
            await update_auto_join(workspace, AutoJoinInput(enabled=True), request(), owner, db)
            await sign_in(identity)
            await sign_in(identity)
            assert await is_member(existing) is True
            assert len(await audits("workspace.member.auto_joined")) == 2

            # Removal and leaving both stick, until an invitation brings the person back.
            # VI: Bị xoá và tự rời đều có hiệu lực lâu dài, cho tới khi được mời lại.
            row = await db.execute(text("SELECT id FROM workspace_members WHERE workspace_id = :w AND user_id = :u"), {"w": workspace, "u": existing})
            await remove_member(workspace, row.scalar_one(), owner, db)
            await sign_in(identity)
            assert await is_member(existing) is False

            left = profile()
            leaver = await sign_in(left)
            await leave(workspace, {"id": leaver}, db)
            await sign_in(left)
            assert await is_member(leaver) is False

            # A pending invitation or a suspension is not turned into access.
            # VI: Lời mời đang chờ hoặc trạng thái tạm khoá không biến thành quyền truy cập.
            invited = profile()
            await update_auto_join(workspace, AutoJoinInput(enabled=False), request(), owner, db)
            invited_id = await sign_in(invited)
            await update_auto_join(workspace, AutoJoinInput(enabled=True), request(), owner, db)
            await db.execute(
                text("INSERT INTO workspace_members(id,workspace_id,user_id,status,role,created_at,updated_at) VALUES (:id,:w,:u,'SUSPENDED','MEMBER',:now,:now)"),
                {"id": _cuid(), "w": workspace, "u": invited_id, "now": _utcnow()},
            )
            await db.commit()
            await sign_in(invited)
            statuses = [row["status"] for row in await memberships(invited_id) if row["workspace_id"] == workspace]
            assert statuses == ["SUSPENDED"]

            # A tenant change on the server stops joining without any cleanup.
            # VI: Đổi tenant của server sẽ dừng tự vào mà không cần dọn dữ liệu.
            await update_auto_join(workspace, AutoJoinInput(enabled=True), request(tenant=OTHER_TENANT), owner, db)
            assert await is_member(await sign_in(profile())) is False
    finally:
        await engine.dispose()
