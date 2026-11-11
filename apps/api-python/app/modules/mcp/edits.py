"""Exact-text edits of a document, so an agent changes a long FDS/TDS without resending it.
VI: Sửa tài liệu theo đoạn chính xác, để agent đổi một FDS/TDS dài mà không phải gửi lại cả bài.
"""

from __future__ import annotations

from difflib import get_close_matches

from ...core.errors import ApiError

# Bounds of the hint that helps a client fix a failed edit.
# VI: Giới hạn của gợi ý giúp client sửa một edit bị lỗi.
HINT_CHARS = 200
HINT_LINES = 5


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
            found = (
                "was not found" + nearest_line(content, edit.oldText)
                if count == 0
                else f"occurs {count} times" + occurrence_lines(content, edit.oldText)
            )
            raise ApiError(
                409,
                f"Edit {index}: oldText {found}. Read the current document and use a longer, unique oldText.",
                "Conflict",
            )
        content = content.replace(edit.oldText, edit.newText, 1)
    return content


def nearest_line(content: str, old_text: str) -> str:
    """` (nearest line N: "…")` for the document line most similar to the first non-blank line
    of `old_text`, or "" when nothing is close. The text comes only from the document the
    caller is already allowed to edit and is cut to HINT_CHARS, so the error stays small.
    VI: ` (nearest line N: "…")` cho dòng của tài liệu giống nhất với dòng không rỗng đầu tiên
    VI: của `old_text`, hoặc "" khi không có dòng nào gần. Văn bản chỉ lấy từ tài liệu mà bên
    VI: gọi đã được phép sửa và cắt còn HINT_CHARS, để thông báo lỗi luôn ngắn.
    """
    wanted = next((line.strip() for line in old_text.splitlines() if line.strip()), "")
    lines = [line.strip() for line in content.splitlines()]
    match = get_close_matches(wanted[:HINT_CHARS * 5], lines, n=1, cutoff=0.6)
    if not wanted or not match:
        return ""
    snippet = match[0] if len(match[0]) <= HINT_CHARS else match[0][:HINT_CHARS] + "…"
    return f' (nearest line {lines.index(match[0]) + 1}: "{snippet}")'


def occurrence_lines(content: str, old_text: str) -> str:
    """` (at lines a, b, …)` for the first HINT_LINES occurrences of `old_text`.
    VI: ` (at lines a, b, …)` cho HINT_LINES lần xuất hiện đầu tiên của `old_text`."""
    lines: list[str] = []
    start = content.find(old_text)
    while start != -1 and len(lines) < HINT_LINES:
        lines.append(str(content.count("\n", 0, start) + 1))
        start = content.find(old_text, start + 1)
    return f" (at lines {', '.join(lines)})"
