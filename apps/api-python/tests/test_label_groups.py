"""Label groups: who may manage them and that they never cross workspaces.

The rules come from the NestJS spec deleted in DTD-518; the Python routes are
called directly against the real test database.
VI: Nhóm nhãn: ai được quản lý và chúng không bao giờ vượt ranh giới workspace.
VI: Quy tắc lấy từ spec NestJS đã xoá trong DTD-518; các route Python được gọi
VI: trực tiếp trên database test thật.
"""
import asyncio
import os

import pytest
from sqlalchemy import text

from app.core.errors import ApiError
from app.modules.labels.api import (
    CreateLabelGroupInput,
    CreateLabelInput,
    UpdateLabelGroupInput,
    UpdateLabelInput,
    create_label,
    create_label_group,
    delete_label_group,
    list_label_groups,
    update_label,
    update_label_group,
)
from tests.seeded_workspace import seeded_workspace

pytestmark = pytest.mark.skipif(
    not os.getenv("MCP_TEST_DATABASE_URL"), reason="Test database is not configured"
)


def test_label_groups_stay_inside_their_workspace_and_need_an_administrator():
    asyncio.run(verify())


async def verify():
    async with seeded_workspace() as (factory, workspace, member):
        async with factory() as db:
            home, owner = await workspace(db)
            other, other_owner = await workspace(db, "Other owner")
            plain = await member(db, home["workspace_id"])
            await db.commit()
            ws = home["workspace_id"]

            # A plain member can read groups but not create one.
            # VI: Thành viên thường đọc được nhóm nhưng không tạo được.
            with pytest.raises(ApiError) as denied:
                await create_label_group(CreateLabelGroupInput(workspaceId=ws, name="Area"), plain, db)
            assert denied.value.status_code == 403
            assert (await list_label_groups(ws, plain, db))["data"] == []

            group = (await create_label_group(
                CreateLabelGroupInput(workspaceId=ws, name="  Area  ", description="  "), owner, db
            ))["data"]
            assert (group["name"], group["description"], group["workspaceId"]) == ("Area", None, ws)

            foreign = (await create_label_group(
                CreateLabelGroupInput(workspaceId=other["workspace_id"], name="Foreign"), other_owner, db
            ))["data"]

            # The isolation rule: a label is never filed under another workspace's group,
            # neither when it is created nor when it is moved.
            # VI: Quy tắc cô lập: một nhãn không bao giờ được xếp vào nhóm của workspace
            # VI: khác, dù lúc tạo hay lúc chuyển nhóm.
            with pytest.raises(ApiError) as crossed:
                await create_label(
                    CreateLabelInput(workspaceId=ws, name="Leak", color="#112233", groupId=foreign["id"]), owner, db
                )
            assert crossed.value.status_code == 404
            label = (await create_label(
                CreateLabelInput(workspaceId=ws, name="Bug", color="#112233", groupId=group["id"]), owner, db
            ))["data"]
            with pytest.raises(ApiError) as moved:
                await update_label(label["id"], UpdateLabelInput(groupId=foreign["id"]), ws, owner, db)
            assert moved.value.status_code == 404
            assert (await db.execute(
                text("SELECT group_id FROM labels WHERE id=:id"), {"id": label["id"]}
            )).scalar_one() == group["id"]

            # Another workspace's group cannot be reached through this workspace either.
            # VI: Nhóm của workspace khác cũng không với tới được qua workspace này.
            for attempt in (
                update_label_group(foreign["id"], UpdateLabelGroupInput(name="Taken"), ws, owner, db),
                delete_label_group(foreign["id"], ws, owner, db),
            ):
                with pytest.raises(ApiError) as hidden:
                    await attempt
                assert hidden.value.status_code == 404
            assert [g["id"] for g in (await list_label_groups(ws, owner, db))["data"]] == [group["id"]]

            # Deleting a group keeps its labels and only clears their group.
            # VI: Xoá nhóm thì giữ nhãn và chỉ bỏ nhóm của chúng.
            await delete_label_group(group["id"], ws, owner, db)
            assert (await db.execute(
                text("SELECT group_id FROM labels WHERE id=:id"), {"id": label["id"]}
            )).one() == (None,)
