"""Exact-text edits of a document, so an agent changes a long FDS/TDS without resending it.
VI: Sửa tài liệu theo đoạn chính xác, để agent đổi một FDS/TDS dài mà không phải gửi lại cả bài.
"""

from __future__ import annotations

from ...core.errors import ApiError


def apply_edits(content: str, edits) -> str:
    """Applies `edits` in order; each `oldText` must occur exactly once in the text as it is when
    that edit runs, so an ambiguous or stale edit fails instead of changing the wrong place. Any
    failure leaves the document untouched because nothing is written until all edits apply.
    VI: Áp dụng `edits` theo thứ tự; mỗi `oldText` phải xuất hiện đúng một lần trong văn bản tại
    VI: thời điểm sửa, nên sửa mơ hồ hoặc đã cũ sẽ lỗi thay vì đổi nhầm chỗ. Lỗi bất kỳ giữ nguyên
    VI: tài liệu vì chưa ghi gì cho tới khi mọi đoạn sửa áp dụng được.
    """
    for index, edit in enumerate(edits, start=1):
        count = content.count(edit.oldText)
        if count != 1:
            found = "was not found" if count == 0 else f"occurs {count} times"
            raise ApiError(
                409,
                f"Edit {index}: oldText {found}. Read the current document and use a longer, unique oldText.",
                "Conflict",
            )
        content = content.replace(edit.oldText, edit.newText, 1)
    return content
