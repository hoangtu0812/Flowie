import json
from typing import Annotated, Literal

from fastapi import Depends
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.timezones import time_zone
from ...core.utc_responses import UtcAPIRouter
from ...db.session import get_session
from .auth import current_user
from .commands import (
    WRITE_PREFERENCES_INSERT_USER_UI_PREFERENCES,
    WRITE_PREFERENCES_UPDATE_USER_UI_PREFERENCES,
    WRITE_PREFERENCES_UPDATE_USERS,
)
from .queries import (
    READ_PREFERENCES_SELECT_USER_UI_PREFERENCES,
)

router = UtcAPIRouter(
    prefix="/api/v1/users/me/ui-preferences", tags=["account-preferences"]
)


# Column keys are free text within a strict shape instead of a fixed list: an
# API rolled back to an older build must still read a document a newer build
# wrote with a column it does not know, and the web app ignores unknown keys.
# VI: Khoá cột là văn bản tự do trong một khuôn chặt thay vì danh sách cố định:
# API rollback về bản cũ vẫn phải đọc được document do bản mới ghi với cột nó
# không biết, và web bỏ qua các khoá lạ.
ColumnKey = Annotated[str, StringConstraints(pattern=r"^[A-Za-z]{1,40}$")]
ColumnWidth = Annotated[int, Field(ge=40, le=2000)]


class IssueColumns(BaseModel):
    """Issue list columns of one account: visibility, order and pixel widths.

    Each write replaces the whole object, because the preference document is
    merged only at its top level. Sizes are bounded so a client cannot store an
    unbounded document; sub-fields a later release may add are dropped rather
    than rejected, for the same rollback reason as ColumnKey.

    VI: Cột của danh sách issue theo tài khoản: ẩn/hiện, thứ tự và độ rộng px.

    Mỗi lần ghi thay cả object, vì document preferences chỉ merge ở cấp ngoài
    cùng. Kích thước có giới hạn để client không lưu document vô hạn; field con
    mà bản sau có thể thêm bị bỏ đi thay vì từ chối, cùng lý do rollback như
    ColumnKey.
    """

    model_config = ConfigDict(extra="ignore")
    visible: dict[ColumnKey, bool] = Field(default_factory=dict, max_length=30)
    order: list[ColumnKey] = Field(default_factory=list, max_length=30)
    widths: dict[ColumnKey, ColumnWidth] = Field(default_factory=dict, max_length=30)


class UiValues(BaseModel):
    model_config = ConfigDict(extra="forbid")
    locale: Literal["en", "vi"] = "en"
    commentSubmitMode: Literal["modifier-enter", "enter"] = "modifier-enter"
    defaultHome: Literal["inbox", "my-issues"] = "inbox"
    defaultWorkspaceId: str | None = Field(default=None, min_length=1, max_length=100)
    fontSize: Literal["default", "small", "large"] = "default"
    pointerCursors: bool = True
    underlineLinks: bool = False
    timezone: str | None = Field(default=None, max_length=100)
    weekStart: Literal[0, 1, 6] = 1
    autoAssignSelf: bool = False
    # Release the account was last told about, as the version string the web
    # bundle carries from CHANGELOG.md (for example "0.13.0"). None means no
    # release has ever been announced to it, which the web app treats as "adopt
    # the running version silently" so a first sign-in is not interrupted.
    # Bounded because it is free text from the client, never an identifier the
    # API resolves.
    # VI: Bản phát hành mà tài khoản được thông báo gần nhất, theo chuỗi phiên
    # bản mà bundle web mang từ CHANGELOG.md (ví dụ "0.13.0"). None nghĩa là
    # chưa từng thông báo bản nào, và web coi đó là "âm thầm nhận phiên bản đang
    # chạy" để không chen vào lần đăng nhập đầu tiên. Có giới hạn độ dài vì đây
    # là văn bản tự do từ client, không phải identifier mà API tra cứu.
    lastSeenReleaseVersion: str | None = Field(default=None, max_length=50)
    # None means the account never configured its issue columns, so the web
    # app keeps the defaults (or the choice the browser already had).
    # VI: None nghĩa là tài khoản chưa từng cấu hình cột issue, nên web giữ mặc
    # định (hoặc lựa chọn trình duyệt đã có).
    issueColumns: IssueColumns | None = None

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value):
        if value is None:
            return None
        normalized = {"Asia/Saigon": "Asia/Ho_Chi_Minh"}.get(
            value.strip(), value.strip()
        )
        time_zone(normalized)
        return normalized


def known_values(stored):
    """Drop stored settings this build does not know about.

    UiValues forbids extra fields so a client cannot write junk into the
    document, but the same model validates what is already in the database. A
    row written by a newer release, or left behind after rolling the API back,
    would otherwise make a plain read of the account's preferences fail and lock
    the person out of every screen that waits for them. Unknown keys stay in the
    JSON document untouched, because writes merge rather than replace, so an
    upgrade or a roll-forward starts honouring them again.

    VI: Bỏ các thiết lập đã lưu mà bản dựng này không biết.

    UiValues chặn field lạ để client không ghi rác vào document, nhưng cùng
    model đó cũng validate dữ liệu đã có trong cơ sở dữ liệu. Một bản ghi do
    phiên bản mới hơn tạo ra, hoặc còn sót lại sau khi rollback API, nếu không
    lọc sẽ làm chính việc đọc preferences của tài khoản lỗi và khoá người dùng
    khỏi mọi màn hình đang chờ dữ liệu đó. Các khoá lạ vẫn nằm nguyên trong JSON
    vì đường ghi là merge chứ không ghi đè, nên khi nâng cấp lại thì chúng được
    dùng tiếp.
    """
    fields = UiValues.model_fields
    return {key: value for key, value in (stored or {}).items() if key in fields}


class PreferencesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expectedVersion: int = Field(ge=0)
    accountId: str = Field(min_length=1, max_length=100)
    values: UiValues


async def read_preferences(db, user_id):
    row = (
        (
            await db.execute(
                READ_PREFERENCES_SELECT_USER_UI_PREFERENCES,
                {"user": user_id},
            )
        )
        .mappings()
        .first()
    )
    return {
        "accountId": user_id,
        "values": UiValues.model_validate(
            known_values(row["preferences"] if row else {})
        ).model_dump(),
        "version": row["version"] if row else 0,
    }


async def write_preferences(db, user_id, payload):
    if payload.accountId != user_id:
        raise ApiError(
            409, "Your account changed. Reload preferences before saving.", "Conflict"
        )
    params = {
        "user": user_id,
        "values": json.dumps(payload.values.model_dump(exclude_unset=True)),
        "expected": payload.expectedVersion,
        "now": utcnow(),
    }
    query = (
        WRITE_PREFERENCES_INSERT_USER_UI_PREFERENCES
        if payload.expectedVersion == 0
        else WRITE_PREFERENCES_UPDATE_USER_UI_PREFERENCES
    )
    saved = (await db.execute(query, params)).mappings().first()
    if saved is None:
        raise ApiError(
            409,
            "Preferences changed on another device. Reload before saving.",
            "Conflict",
        )
    values = UiValues.model_validate(known_values(saved["preferences"])).model_dump()
    if "timezone" in payload.values.model_fields_set and values["timezone"]:
        await db.execute(
            WRITE_PREFERENCES_UPDATE_USERS,
            {"zone": values["timezone"], "now": params["now"], "user": user_id},
        )
    return {
        "values": values,
        "version": saved["version"],
        "accountId": user_id,
    }


@router.get("")
async def get_preferences(user=Depends(current_user), db=Depends(get_session)):
    return {"data": await read_preferences(db, user["id"])}


@router.put("")
async def put_preferences(
    payload: PreferencesUpdate, user=Depends(current_user), db=Depends(get_session)
):
    result = await write_preferences(db, user["id"], payload)
    await db.commit()
    return {"data": result}
