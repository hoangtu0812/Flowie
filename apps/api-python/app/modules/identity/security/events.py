from sqlalchemy import text

from ....core.clock import _utcnow
from ....core.identifiers import _cuid


def request_metadata(request):
    return {
        "ip": request.client.host[:100] if request.client else None,
        "agent": request.headers.get("user-agent", "")[:512] or None,
    }


async def record_event(db, user_id, kind, method, request):
    if user_id is None:
        return
    await db.execute(
        text(
            "INSERT INTO account_security_events(id,user_id,kind,method,ip_address,user_agent,created_at) VALUES (:id,:user,:kind,:method,:ip,:agent,:now)"
        ),
        {
            "id": _cuid(),
            "user": user_id,
            "kind": kind,
            "method": method,
            **request_metadata(request),
            "now": _utcnow(),
        },
    )
