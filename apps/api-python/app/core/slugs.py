"""URL slug rules shared by projects and workspaces.

A slug is 1–63 characters of a-z, 0-9 and single hyphens, with no hyphen at either end. It is
validated, never rewritten, so what the user typed is exactly what is saved. A slug shaped like a
generated id ("c" plus 24 lowercase letters or digits) is refused because routes accept ids too.
VI: Quy tắc slug URL dùng chung cho dự án và workspace. Slug gồm 1–63 ký tự a-z, 0-9 và dấu gạch
nối đơn, không có gạch nối ở hai đầu. Slug chỉ được kiểm tra, không bao giờ tự sửa, nên giá trị
lưu đúng như người dùng nhập. Slug có dạng giống id sinh ra ("c" cộng 24 chữ thường hoặc số) bị từ
chối vì route cũng nhận id.
"""

from __future__ import annotations

import re

from .errors import ApiError

URL_SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")
GENERATED_ID = re.compile(r"c[a-z0-9]{24}")
# First path segments the web app owns; a workspace slug equal to one would never be reachable.
# VI: Đoạn path đầu tiên do web app sử dụng; slug workspace trùng với chúng sẽ không bao giờ mở được.
RESERVED_WORKSPACE_SLUGS = frozenset(
    {"admin", "api", "auth", "invitations", "_next", "static", "public", "health", "favicon-ico"}
)


def url_slug(value: str, *, reserved: frozenset[str] = frozenset()) -> str:
    """Returns the slug unchanged or raises a 400 that says what to fix.
    VI: Trả lại slug nguyên vẹn hoặc báo lỗi 400 nói rõ cần sửa gì.
    """
    if not (1 <= len(value) <= 63 and URL_SLUG.fullmatch(value)):
        raise ApiError(400, "Slug must be 1–63 characters of a-z, 0-9 and single hyphens, without a hyphen at the start or end.", "Bad Request")
    if GENERATED_ID.fullmatch(value):
        raise ApiError(400, "This slug looks like an id. Choose a more readable slug.", "Bad Request")
    if value in reserved:
        raise ApiError(400, "This slug is reserved by Flowie. Choose another slug.", "Bad Request")
    return value
