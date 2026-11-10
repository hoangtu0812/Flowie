
from ....core.clock import utcnow
from ....core.identifiers import cuid
from .commands import (
    RECORD_EVENT_INSERT_ACCOUNT_SECURITY_EVENTS,
)


def request_metadata(request):
    return {
        "ip": request.client.host[:100] if request.client else None,
        "agent": request.headers.get("user-agent", "")[:512] or None,
    }


async def record_event(db, user_id, kind, method, request):
    if user_id is None:
        return
    await db.execute(
        RECORD_EVENT_INSERT_ACCOUNT_SECURITY_EVENTS,
        {
            "id": cuid(),
            "user": user_id,
            "kind": kind,
            "method": method,
            **request_metadata(request),
            "now": utcnow(),
        },
    )
