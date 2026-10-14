from __future__ import annotations
from datetime import datetime, timezone


def _utcnow() -> datetime:
    # Prisma maps these columns to PostgreSQL `timestamp without time zone`.
    # Keep Python values UTC-naive so asyncpg does not mix offset-aware values
    # with the existing schema.
    return datetime.now(timezone.utc).replace(tzinfo=None)
