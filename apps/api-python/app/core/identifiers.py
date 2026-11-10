from __future__ import annotations

from hashlib import sha256
from secrets import token_urlsafe


def cuid() -> str:
    return f"c{token_urlsafe(18).replace('-', 'a').replace('_', 'b').lower()}"


# shortcut: private alias kept for callers not yet moved out of app/domains; delete it once DTD-523
# has switched every caller to `cuid`.
# VI: shortcut: alias nội bộ giữ cho các nơi gọi chưa chuyển khỏi app/domains; xoá khi DTD-523 đã
# VI: chuyển mọi nơi gọi sang `cuid`.
_cuid = cuid


def _hash_token(token: str) -> str:
    return sha256(token.encode("utf-8")).hexdigest()
