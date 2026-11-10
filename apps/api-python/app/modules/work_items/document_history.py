from __future__ import annotations

import asyncio
from difflib import unified_diff
from itertools import islice

from sqlalchemy.ext.asyncio import AsyncSession

from ...core.errors import ApiError
from .queries import (
    LIST_REVISIONS_SELECT_DOCUMENT_REVISIONS,
    REVISION_ROW_SELECT_DOCUMENT_REVISIONS,
    list_releases_select_document_releases_sql,
    release_row_select_document_releases_sql,
)


async def list_revisions(db: AsyncSession, document_id: str) -> dict:
    rows = (
        await db.execute(
            LIST_REVISIONS_SELECT_DOCUMENT_REVISIONS,
            {"id": document_id},
        )
    ).mappings()
    return {"items": [dict(row) for row in rows], "limit": 100}


async def revision_row(db: AsyncSession, document_id: str, version: int) -> dict:
    row = (
        (
            await db.execute(
                REVISION_ROW_SELECT_DOCUMENT_REVISIONS,
                {"id": document_id, "version": version},
            )
        )
        .mappings()
        .first()
    )
    if not row:
        raise ApiError(404, "Document revision not found.", "Not Found")
    return dict(row)


RELEASE_COLUMNS = (
    'r.release, r.revision, r.title, r.approved_at AS "approvedAt", '
    "json_build_object('id', u.id, 'name', u.name) AS \"approvedBy\""
)


async def list_releases(db: AsyncSession, document_id: str) -> dict:
    """Approved releases of a document, newest first, without their content.
    VI: Các phiên bản đã duyệt của tài liệu, mới nhất trước, không kèm nội dung."""
    rows = (
        await db.execute(
            list_releases_select_document_releases_sql(RELEASE_COLUMNS),
            {"id": document_id},
        )
    ).mappings()
    return {"items": [dict(row) for row in rows], "limit": 100}


async def release_row(db: AsyncSession, document_id: str, release: int) -> dict:
    """One approved release with the title and content frozen at approval.
    VI: Một phiên bản đã duyệt kèm tiêu đề và nội dung được chụp lúc duyệt."""
    row = (
        (
            await db.execute(
                release_row_select_document_releases_sql(RELEASE_COLUMNS),
                {"id": document_id, "release": release},
            )
        )
        .mappings()
        .first()
    )
    if not row:
        raise ApiError(404, "Document release not found.", "Not Found")
    return dict(row)


async def revision_diff(before: dict, after: dict, max_lines: int = 500) -> dict:
    left, right = (
        before["content"].splitlines(keepends=True),
        after["content"].splitlines(keepends=True),
    )
    if (
        max(len(left), len(right)) > 2000
        or max(len(before["content"]), len(after["content"])) > 100000
    ):
        raise ApiError(
            413,
            "Read document and revision text pages to compare this large document.",
            "Payload Too Large",
        )
    lines = await asyncio.to_thread(
        lambda: list(
            islice(
                unified_diff(
                    left,
                    right,
                    fromfile=f"revision-{before['version']}",
                    tofile=f"revision-{after['version']}",
                ),
                max_lines + 1,
            )
        )
    )
    result = "".join(lines[:max_lines])
    return {
        "fromVersion": before["version"],
        "toVersion": after["version"],
        "fromTitle": before["title"],
        "toTitle": after["title"],
        "diff": result[:20000],
        "truncated": len(lines) > max_lines or len(result) > 20000,
    }
