from __future__ import annotations
from secrets import token_urlsafe
from hashlib import sha256


def _cuid() -> str:
    return f"c{token_urlsafe(18).replace('-', 'a').replace('_', 'b').lower()}"


def _hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()
