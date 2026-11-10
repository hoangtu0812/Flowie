from __future__ import annotations

from hashlib import sha256
from secrets import token_urlsafe


def cuid() -> str:
    return f"c{token_urlsafe(18).replace('-', 'a').replace('_', 'b').lower()}"


def hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()
