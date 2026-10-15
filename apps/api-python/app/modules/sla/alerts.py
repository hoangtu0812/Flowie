import json

from sqlalchemy import text

from ...core.errors import ApiError
from ...services.notification_events import (
    create_notification_batch,
    issue_recipient_ids,
)
from ..notifications.outbox import stage_notifications
from ..work_items.contracts import UpdateIssueInput
from ..work_items.issues import update_issue
from .cycles import LIVE, TERMINAL


async def escalation_actor(db, issue, identifier):
    if not identifier:
        return None
    return (
        (
            await db.execute(
                text("""SELECT u.id,u.name,u.avatar_url FROM users u
        JOIN workspace_members wm ON wm.user_id=u.id AND wm.workspace_id=:workspace
        JOIN team_members tm ON tm.user_id=u.id AND tm.team_id=:team
        WHERE u.id=:id AND u.status='ACTIVE' AND wm.status='ACTIVE' FOR SHARE OF u,wm,tm"""),
                {
                    "id": identifier,
                    "workspace": issue["workspace_id"],
                    "team": issue["team_id"],
                },
            )
        )
        .mappings()
        .first()
    )


async def escalate(db, issue, cycle, now):
    target = cycle["snapshot"].get("escalateToId")
    if not target:
        return "NO_TARGET", None
    if (
        issue["archived_at"] is not None
        or issue["team_archived_at"] is not None
        or issue["category"] in TERMINAL
        or cycle["state"] not in LIVE
    ):
        return "SKIPPED_TERMINAL", None
    if cycle["state"] == "PAUSED":
        return "SKIPPED_PAUSED", None
    actor = await escalation_actor(db, issue, cycle["snapshot"].get("createdBy"))
    recipient = await escalation_actor(db, issue, target)
    if actor is None or recipient is None:
        return "SKIPPED_NO_ACCESS", None
    if issue["assignee_id"] == target:
        return "ALREADY_ASSIGNED", None
    try:
        async with db.begin_nested():
            await update_issue(
                issue["id"],
                UpdateIssueInput(assigneeId=target),
                issue["workspace_id"],
                dict(actor),
                db,
            )
        issue["assignee_id"] = target
        return "APPLIED", now
    except ApiError as error:
        return (
            "SKIPPED_NO_ACCESS" if error.status_code in (403, 404) else "INVALID_INPUT"
        ), None


async def alert_intent(db, issue, cycle, kind, now, *, suppressed=None):
    if suppressed:
        return {"outcome": suppressed, "recipients": 0}
    recipients = await issue_recipient_ids(db, issue["id"])
    recipients |= {
        value for value in [issue["creator_id"], issue["assignee_id"]] if value
    }
    batch = await create_notification_batch(
        db,
        workspace_id=issue["workspace_id"],
        recipient_ids=recipients,
        actor={"id": None, "name": "SLA automation", "avatar_url": None},
        event_type="issue.sla_" + kind,
        entity_type="issue",
        entity_id=issue["id"],
        title=issue["title"],
        message="SLA is nearing its deadline"
        if kind == "warning"
        else "SLA deadline was exceeded",
        entity_path="/issue/" + issue["identifier"],
        entity_label=issue["identifier"],
        discord=False,
    )
    await stage_notifications(db, batch, workspace_id=issue["workspace_id"])
    return {
        "outcome": "QUEUED" if batch.records else "NO_AUTHORIZED_RECIPIENTS",
        "recipients": len(batch.records),
    }


async def process_alerts(db, issue, latest, now):
    overdue = (
        (
            await db.execute(
                text(
                    "SELECT * FROM issue_sla_cycles WHERE issue_id=:id AND breached_at IS NOT NULL AND breach_sent_at IS NULL ORDER BY cycle LIMIT 20 FOR UPDATE"
                ),
                {"id": issue["id"]},
            )
        )
        .mappings()
        .all()
    )
    for raw in overdue:
        cycle = dict(raw)
        suppressed = None
        if latest is None or cycle["id"] != latest["id"]:
            suppressed = "SUPERSEDED_CYCLE"
        elif (
            issue["archived_at"] is not None
            or issue["team_archived_at"] is not None
            or cycle["state"] in ("CANCELED", "OVERRIDDEN")
        ):
            suppressed = "INACTIVE_ISSUE"
        code, applied = cycle["escalation_code"], cycle["escalated_at"]
        if code is None:
            code, applied = (
                await escalate(db, issue, cycle, now)
                if suppressed is None
                else ("SKIPPED_SUPERSEDED", None)
            )
        result = await alert_intent(
            db, issue, cycle, "breached", now, suppressed=suppressed
        )
        outcomes = {**cycle["alert_results"], "breach": result}
        await db.execute(
            text(
                """UPDATE issue_sla_cycles SET breach_sent_at=:now,escalation_code=:code,escalated_at=:applied,alert_results=CAST(:results AS jsonb) WHERE id=:id"""
            ),
            {
                "id": cycle["id"],
                "now": now,
                "code": code,
                "applied": applied,
                "results": json.dumps(outcomes),
            },
        )
    if (
        latest
        and latest["state"] == "ACTIVE"
        and latest["breached_at"] is None
        and latest["warning_sent_at"] is None
        and latest["warning_at"] is not None
        and latest["warning_at"] <= now
    ):
        inactive = (
            issue["archived_at"] is not None or issue["team_archived_at"] is not None
        )
        result = await alert_intent(
            db,
            issue,
            latest,
            "warning",
            now,
            suppressed="INACTIVE_ISSUE" if inactive else None,
        )
        await db.execute(
            text(
                "UPDATE issue_sla_cycles SET warning_sent_at=:now,alert_results=CAST(:results AS jsonb) WHERE id=:id"
            ),
            {
                "id": latest["id"],
                "now": now,
                "results": json.dumps({**latest["alert_results"], "warning": result}),
            },
        )
