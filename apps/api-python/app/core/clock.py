from __future__ import annotations

from datetime import UTC, datetime


def utcnow() -> datetime:
    # Prisma maps these columns to PostgreSQL `timestamp without time zone`.
    # Keep Python values UTC-naive so asyncpg does not mix offset-aware values
    # with the existing schema.
    return datetime.now(UTC).replace(tzinfo=None)


# shortcut: private alias kept for callers not yet moved out of app/domains; delete it once DTD-523
# has switched every caller to `utcnow`.
# VI: shortcut: alias nội bộ giữ cho các nơi gọi chưa chuyển khỏi app/domains; xoá khi DTD-523 đã
# VI: chuyển mọi nơi gọi sang `utcnow`.
_utcnow = utcnow
