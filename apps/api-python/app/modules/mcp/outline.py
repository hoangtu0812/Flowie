"""Markdown outlines and sections, so an agent reads the part of a long document it needs
instead of the whole text.
VI: Mục lục và phần của Markdown, để agent chỉ đọc phần cần thiết của một tài liệu dài thay
VI: vì cả bài.
"""

from __future__ import annotations

import re
from typing import Any

from ...core.errors import ApiError

# ATX headings only (`# Title`), up to three leading spaces, optional closing hashes.
# VI: Chỉ heading kiểu ATX (`# Title`), tối đa ba khoảng trắng đầu, có thể có `#` đóng cuối.
HEADING = re.compile(r"^ {0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$")
FENCE = re.compile(r"^ {0,3}(```|~~~)")
# Bounds the heading list in a "section not found" error so the error stays small.
# VI: Giới hạn danh sách heading trong lỗi "không thấy phần" để thông báo lỗi luôn ngắn.
HINT_HEADINGS = 30


def headings(content: str) -> list[dict[str, Any]]:
    """Every heading outside fenced code blocks, with its 1-based `line`, character `offset`
    and the `length` of its section: up to the next heading of the same or a higher level
    (smaller number), or the end of the text, so a section includes its sub-sections.
    VI: Mọi heading ngoài code block, kèm `line` (từ 1), `offset` (ký tự) và `length` của
    VI: phần: tới heading kế tiếp cùng cấp hoặc cấp cao hơn (số nhỏ hơn), hoặc hết văn bản,
    VI: nên một phần gồm cả các mục con.
    """
    found: list[dict[str, Any]] = []
    offset, fenced = 0, False
    for number, line in enumerate(content.splitlines(keepends=True), start=1):
        if FENCE.match(line):
            fenced = not fenced
        elif not fenced and (match := HEADING.match(line.rstrip("\r\n"))):
            found.append(
                {"level": len(match[1]), "title": match[2].strip(), "line": number, "offset": offset}
            )
        offset += len(line)
    for index, heading in enumerate(found):
        end = next(
            (later["offset"] for later in found[index + 1:] if later["level"] <= heading["level"]),
            len(content),
        )
        heading["length"] = end - heading["offset"]
    return found


def outline(content: str, max_level: int = 6, positions: bool = True) -> list[dict[str, Any]]:
    """Headings up to `max_level`; without `positions` only level, title and line remain,
    which is the short form returned after a write.
    VI: Các heading tới cấp `max_level`; không có `positions` thì chỉ giữ cấp, tiêu đề và
    VI: dòng, là dạng ngắn trả về sau khi ghi.
    """
    keys = ("level", "title", "line", "offset", "length") if positions else ("level", "title", "line")
    return [{key: h[key] for key in keys} for h in headings(content) if h["level"] <= max_level]


def find_section(content: str, title: str) -> dict[str, Any]:
    """The single heading whose title matches `title` case-insensitively, ignoring leading `#`
    and surrounding spaces. No match is a 404 listing the headings; several matches are a 400
    with their lines, because guessing would return the wrong part.
    VI: Heading duy nhất có tiêu đề khớp `title` (không phân biệt hoa thường, bỏ `#` đầu và
    VI: khoảng trắng). Không khớp → 404 kèm danh sách heading; khớp nhiều → 400 kèm số dòng,
    VI: vì đoán sẽ trả nhầm phần.
    """
    wanted = title.strip().lstrip("#").strip().casefold()
    every = headings(content)
    matches = [h for h in every if h["title"].casefold() == wanted]
    if not matches:
        names = ", ".join(f'"{h["title"]}"' for h in every[:HINT_HEADINGS]) or "none"
        raise ApiError(404, f'Section "{title}" was not found. Headings: {names}'[:1000], "Not Found")
    if len(matches) > 1:
        lines = ", ".join(str(h["line"]) for h in matches[:5])
        raise ApiError(
            400,
            f'Section "{title}" occurs {len(matches)} times (lines {lines}); read it with offset/limit from the outline.',
            "Bad Request",
        )
    return matches[0]
