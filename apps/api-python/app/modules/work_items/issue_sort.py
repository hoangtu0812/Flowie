from __future__ import annotations

import json

from sqlalchemy import text

from ...core.errors import ApiError
from .issue_queries import _issue_rows

SORT_COLUMNS = {
    "title": "lower(i.title)",
    "labels": "(SELECT string_agg(lower(l.name), ', ' ORDER BY lower(l.name),l.id) FROM issue_labels il JOIN labels l ON l.id=il.label_id WHERE il.issue_id=i.id)",
    "project": "(SELECT lower(p.name) FROM projects p WHERE p.id=i.project_id)",
    "startDate": "i.start_date",
    "targetDate": "i.target_date",
    "estimatedEffort": "i.estimated_effort",
    "actualEffort": "i.actual_effort",
    "cycle": "(SELECT lower(c.name) FROM issue_cycles ic JOIN cycles c ON c.id=ic.cycle_id WHERE ic.issue_id=i.id ORDER BY ic.created_at,ic.cycle_id LIMIT 1)",
    "created": "i.created_at",
    "dueDate": "i.due_date",
    "assignee": "(SELECT lower(u.name) FROM users u WHERE u.id=i.assignee_id)",
}


def parse_sort(raw):
    if not raw:
        return []
    try:
        items = json.loads(raw) if isinstance(raw, str) else raw
        if not isinstance(items, list) or len(items) > 5:
            raise ValueError
        keys = set()
        for item in items:
            if not isinstance(item, dict) or set(item) != {"key", "direction"}:
                raise ValueError
            key, direction = item["key"], item["direction"]
            if (
                not isinstance(key, str)
                or key not in SORT_COLUMNS
                or key in keys
                or direction not in ("asc", "desc")
            ):
                raise ValueError
            keys.add(key)
        return items
    except (ValueError, TypeError, KeyError):
        raise ApiError(400, "Invalid issue column sort.", "Bad Request") from None


async def sorted_page(db, workspace, user, sql, params, sorts, codec, options, total):
    # Only fixed expressions and validated direction tokens enter SQL; values stay bound parameters.
    # Ordinals cover the authorized scope, with deterministic ties and nulls last in both directions.
    # VI: Chỉ biểu thức cố định và hướng đã kiểm tra được ghép SQL; giá trị vẫn là tham số bind.
    # VI: Số thứ tự bao phủ scope được cấp quyền, có tie-break ổn định và null cuối ở cả hai hướng.
    order = (
        ",".join(
            f"{SORT_COLUMNS[item['key']]} {item['direction'].upper()} NULLS LAST"
            for item in sorts
        )
        + ",i.id ASC"
    )
    ranked = (
        "SELECT i.id,i.created_at,row_number() OVER (ORDER BY "
        + order
        + ") AS ordinal "
        + sql
    )
    after = 0
    if options.get("cursor"):
        _, anchor = codec.decode(options["cursor"])
        try:
            identifier, number = anchor.rsplit(":", 1)
            after = int(number)
            if after < 1:
                raise ValueError
        except ValueError:
            raise ApiError(
                400, "Invalid cursor. Start a new search.", "Bad Request"
            ) from None
        found = (
            await db.execute(
                text("SELECT ordinal FROM (" + ranked + ") ranked WHERE id=:anchor_id"),
                {**params, "anchor_id": identifier},
            )
        ).scalar_one_or_none()
        if found != after:
            raise ApiError(
                409,
                "The order changed. Reload the list before loading more.",
                "Conflict",
            )
    limit = options.get("limit", 100)
    rows = (
        (
            await db.execute(
                text(
                    "SELECT * FROM ("
                    + ranked
                    + ") ranked WHERE ordinal>:after ORDER BY ordinal LIMIT :limit"
                ),
                {**params, "after": after, "limit": limit + 1},
            )
        )
        .mappings()
        .all()
    )
    page = rows[:limit]
    return {
        "data": await _issue_rows(db, [row["id"] for row in page], workspace, user),
        "meta": {
            "total": total,
            "limit": limit,
            "nextCursor": codec.encode(
                page[-1]["created_at"], f"{page[-1]['id']}:{page[-1]['ordinal']}"
            )
            if len(rows) > limit
            else None,
        },
    }
