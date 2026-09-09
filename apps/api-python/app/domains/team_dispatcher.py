from __future__ import annotations

"""Scheduled autonomous dispatcher (Phase 3).

The dispatcher acts without a human in the loop, so its allowlist is narrow
on purpose: it only assigns currently-unassigned open issues and nudges
overdue assignees. It never unassigns, never reassigns, and never touches
completed, canceled or archived issues. Every run is bounded by a daily action
budget, gated by an explicit per-team opt-in, recorded in the audit log, and
announced on Discord. Dry-run mode reports what would happen without writing.
"""

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from ..core.errors import ApiError
from ..db.session import get_session
from .auth import _cuid, _utcnow, current_user
from .team_insights import HCM, assignment_suggestions, hcm_today

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/teams", tags=["team-dispatcher"])

DISPATCH_HOUR = 8
DISPATCH_MINUTE = 30
MAX_NUDGES_PER_RUN = 20
ASSIGN_AUDIT_ACTION = "dispatcher.assignment.applied"
NUDGE_NOTIFICATION_TYPE = "dispatcher.overdue_nudge"
ASSIGN_NOTIFICATION_TYPE = "dispatcher.assignment"


class DispatcherSettingsInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled: bool = False
    dryRun: bool = True
    maxActionsPerDay: int = Field(default=5, ge=1, le=20)
    assignUnassigned: bool = True
    nudgeOverdue: bool = True


def remaining_budget(max_actions: int, used: int) -> int:
    """Daily action budget left; never negative."""
    return max(int(max_actions) - int(used), 0)


def dispatch_cutoff_utc(now: datetime | None = None) -> datetime:
    """Start of today's dispatch window (08:30 +07) expressed in UTC."""
    current = (now or _utcnow()).astimezone(HCM)
    return current.replace(
        hour=DISPATCH_HOUR, minute=DISPATCH_MINUTE, second=0, microsecond=0
    ).astimezone(timezone.utc)


def seconds_until_next_dispatch(now: datetime | None = None) -> float:
    """Seconds from now until the next 08:30 Asia/Ho_Chi_Minh dispatch run."""
    current = (now or _utcnow()).astimezone(HCM)
    target = current.replace(
        hour=DISPATCH_HOUR, minute=DISPATCH_MINUTE, second=0, microsecond=0
    )
    if target <= current:
        target += timedelta(days=1)
    return max((target - current).total_seconds(), 1.0)


def dispatcher_report_lines(result: dict[str, Any]) -> list[str]:
    """Human-readable lines for the Discord report and tests."""
    lines = [
        f"Team {result['teamName']}" + (" [dry-run]" if result.get("dryRun") else "")
    ]
    for item in result.get("applied", []):
        lines.append(f"Assigned {item['identifier']} to {item['suggestedUserName']}")
    for item in result.get("wouldApply", []):
        lines.append(
            f"Would assign {item['identifier']} to {item['suggestedUserName']}"
        )
    for item in result.get("nudged", []):
        lines.append(f"Reminded {item['assignee']} about {item['identifier']}")
    for item in result.get("wouldNudge", []):
        lines.append(f"Would remind {item['assignee']} about {item['identifier']}")
    if result.get("skippedBudget"):
        lines.append(
            f"Held {result['skippedBudget']} assignment(s): daily budget reached"
        )
    return lines


async def _member_access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(
        text(
            """SELECT 1 FROM workspace_members
               WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'"""
        ),
        {"workspace_id": workspace_id, "user_id": user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(403, "You do not have access to this workspace.", "Forbidden")


async def _manager_access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(
        text("""SELECT 1 FROM workspace_members
               WHERE workspace_id = :workspace_id AND user_id = :user_id
                 AND status = 'ACTIVE' AND role IN ('OWNER', 'ADMIN')"""),
        {"workspace_id": workspace_id, "user_id": user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(403, "Workspace administrator access is required.", "Forbidden")


async def _require_team(
    db: AsyncSession, team_id: str, workspace_id: str
) -> dict[str, Any]:
    result = await db.execute(
        text(
            """SELECT id, workspace_id, name FROM teams
               WHERE id = :team_id AND workspace_id = :workspace_id AND archived_at IS NULL"""
        ),
        {"team_id": team_id, "workspace_id": workspace_id},
    )
    row = result.mappings().first()
    if row is None:
        raise ApiError(404, "Team not found.", "Not Found")
    return dict(row)


def _settings_view(row: Any | None, team_id: str) -> dict[str, Any]:
    if row is None:
        return {
            "teamId": team_id,
            "enabled": False,
            "dryRun": True,
            "maxActionsPerDay": 5,
            "assignUnassigned": True,
            "nudgeOverdue": True,
            "lastRunAt": None,
            "lastRunResult": None,
        }
    return {
        "teamId": team_id,
        "enabled": row["enabled"],
        "dryRun": row["dry_run"],
        "maxActionsPerDay": row["max_actions_per_day"],
        "assignUnassigned": row["assign_unassigned"],
        "nudgeOverdue": row["nudge_overdue"],
        "lastRunAt": row["last_run_at"],
        "lastRunResult": row["last_run_result"],
    }


async def get_settings(db: AsyncSession, team_id: str) -> dict[str, Any]:
    result = await db.execute(
        text("SELECT * FROM team_dispatcher_settings WHERE team_id = :team_id"),
        {"team_id": team_id},
    )
    return _settings_view(result.mappings().first(), team_id)


async def _used_budget(db: AsyncSession, team_id: str, cutoff: datetime) -> int:
    result = await db.execute(
        text("""SELECT COUNT(*)::int AS used FROM audit_logs
               WHERE action = :action AND created_at >= :cutoff
                 AND metadata->>'teamId' = :team_id"""),
        {"action": ASSIGN_AUDIT_ACTION, "cutoff": cutoff, "team_id": team_id},
    )
    return result.mappings().one()["used"]


async def _overdue_assigned(
    db: AsyncSession, team_id: str, today: str
) -> list[dict[str, Any]]:
    result = await db.execute(
        text(
            """SELECT i.id, i.identifier, i.title, i.due_date, i.assignee_id, u.name AS assignee_name
               FROM issues i
               JOIN issue_statuses st ON st.id = i.status_id
               LEFT JOIN users u ON u.id = i.assignee_id
               WHERE i.team_id = :team_id AND i.archived_at IS NULL
                 AND i.assignee_id IS NOT NULL
                 AND i.due_date::date < :today
                 AND st.category NOT IN ('COMPLETED', 'CANCELED')
               ORDER BY i.due_date ASC LIMIT :limit"""
        ),
        {"team_id": team_id, "today": today, "limit": MAX_NUDGES_PER_RUN},
    )
    return [dict(row) for row in result.mappings().all()]


async def _already_nudged(
    db: AsyncSession, issue_ids: list[str], cutoff: datetime
) -> set[str]:
    if not issue_ids:
        return set()
    result = await db.execute(
        text(
            """SELECT entity_id FROM notifications
               WHERE type = :type AND created_at >= :cutoff AND entity_id = ANY(:issue_ids)"""
        ),
        {"type": NUDGE_NOTIFICATION_TYPE, "cutoff": cutoff, "issue_ids": issue_ids},
    )
    return {row["entity_id"] for row in result.mappings().all()}


async def _post_discord_report(
    db: AsyncSession, workspace_id: str, result: dict[str, Any]
) -> bool:
    webhook = await db.execute(
        text("""SELECT webhook_url FROM discord_webhooks
               WHERE workspace_id = :workspace_id AND enabled = TRUE LIMIT 1"""),
        {"workspace_id": workspace_id},
    )
    url = webhook.scalar_one_or_none()
    if not url:
        return False
    lines = dispatcher_report_lines(result)
    description = "🤖 **Auto dispatcher**\n" + "\n".join(f"• {line}" for line in lines)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                url,
                json={
                    "embeds": [
                        {
                            "title": f"Dispatcher · {result['teamName']}",
                            "color": 0x8B5CF6,
                            "description": description[:4000],
                        }
                    ]
                },
            )
        if not response.is_success:
            logger.warning(
                "Dispatcher report rejected by Discord for %s: %s",
                workspace_id,
                response.status_code,
            )
            return False
    except httpx.HTTPError as error:
        logger.warning("Dispatcher report unreachable for %s: %s", workspace_id, error)
        return False
    return True


async def run_team_dispatcher(
    db: AsyncSession, team_id: str, workspace_id: str, today: str, cutoff: datetime
) -> dict[str, Any]:
    """Execute one dispatcher run. Dry-run only reports; live runs write."""
    team = await _require_team(db, team_id, workspace_id)
    settings = await get_settings(db, team_id)
    result: dict[str, Any] = {
        "teamId": team_id,
        "teamName": team["name"],
        "enabled": settings["enabled"],
        "dryRun": settings["dryRun"],
        "applied": [],
        "nudged": [],
        "wouldApply": [],
        "wouldNudge": [],
        "skippedBudget": 0,
    }
    if not settings["enabled"]:
        result["status"] = "disabled"
        return result
    now = _utcnow()
    budget = remaining_budget(
        settings["maxActionsPerDay"], await _used_budget(db, team_id, cutoff)
    )
    if settings["assignUnassigned"] and budget > 0:
        plan = await assignment_suggestions(db, team_id, workspace_id, today, budget)
        for item in plan["suggestions"]:
            entry = {
                "issueId": item["issueId"],
                "identifier": item["identifier"],
                "title": item["title"],
                "suggestedUserId": item["suggestedUserId"],
                "suggestedUserName": item["suggestedUserName"],
                "reason": item["reason"],
            }
            if settings["dryRun"]:
                result["wouldApply"].append(entry)
                continue
            claimed = await db.execute(
                text("""UPDATE issues SET assignee_id = :assignee_id, updated_at = :now
                       WHERE id = :issue_id AND assignee_id IS NULL AND archived_at IS NULL
                         AND EXISTS (
                             SELECT 1 FROM issue_statuses st
                             WHERE st.id = issues.status_id
                               AND st.category NOT IN ('COMPLETED', 'CANCELED'))
                       RETURNING id"""),
                {
                    "assignee_id": item["suggestedUserId"],
                    "now": now,
                    "issue_id": item["issueId"],
                },
            )
            if claimed.mappings().first() is None:
                continue
            await db.execute(
                text("""INSERT INTO audit_logs
                       (id, workspace_id, actor_id, action, entity_type, entity_id, metadata, created_at)
                       VALUES (:id, :workspace_id, NULL, :action, 'issue', :entity_id,
                               CAST(:metadata AS jsonb), :now)"""),
                {
                    "id": _cuid(),
                    "workspace_id": workspace_id,
                    "action": ASSIGN_AUDIT_ACTION,
                    "entity_id": item["issueId"],
                    "metadata": json.dumps(
                        {"teamId": team_id, "assigneeId": item["suggestedUserId"]}
                    ),
                    "now": now,
                },
            )
            await db.execute(
                text("""INSERT INTO notifications
                       (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
                       VALUES (:id, :workspace_id, :user_id, :type, 'issue', :entity_id,
                               CAST(:data AS jsonb), :now)"""),
                {
                    "id": _cuid(),
                    "workspace_id": workspace_id,
                    "user_id": item["suggestedUserId"],
                    "type": ASSIGN_NOTIFICATION_TYPE,
                    "entity_id": item["issueId"],
                    "data": json.dumps(
                        {
                            "message": f"Dispatcher assigned {item['identifier']} to you",
                            "identifier": item["identifier"],
                            "title": item["title"],
                        }
                    ),
                    "now": now,
                },
            )
            result["applied"].append(entry)
        result["skippedBudget"] = max(
            plan["unassignedTotal"] - len(plan["suggestions"]), 0
        )
    if settings["nudgeOverdue"]:
        overdue = await _overdue_assigned(db, team_id, today)
        sent = await _already_nudged(db, [issue["id"] for issue in overdue], cutoff)
        for issue in overdue:
            if issue["id"] in sent:
                continue
            due = issue["due_date"].date().isoformat() if issue["due_date"] else None
            entry = {
                "issueId": issue["id"],
                "identifier": issue["identifier"],
                "title": issue["title"],
                "assignee": issue["assignee_name"],
                "dueDate": due,
            }
            if settings["dryRun"]:
                result["wouldNudge"].append(entry)
                continue
            await db.execute(
                text("""INSERT INTO notifications
                       (id, workspace_id, user_id, type, entity_type, entity_id, data, created_at)
                       VALUES (:id, :workspace_id, :user_id, :type, 'issue', :entity_id,
                               CAST(:data AS jsonb), :now)"""),
                {
                    "id": _cuid(),
                    "workspace_id": workspace_id,
                    "user_id": issue["assignee_id"],
                    "type": NUDGE_NOTIFICATION_TYPE,
                    "entity_id": issue["id"],
                    "data": json.dumps(
                        {
                            "message": f"{issue['identifier']} is overdue since {due}",
                            "identifier": issue["identifier"],
                            "title": issue["title"],
                            "dueDate": due,
                        }
                    ),
                    "now": now,
                },
            )
            result["nudged"].append(entry)
    reported = await _post_discord_report(db, workspace_id, result)
    result["reported"] = reported
    await db.execute(
        text(
            """INSERT INTO team_dispatcher_settings
               (team_id, enabled, dry_run, max_actions_per_day, assign_unassigned,
                nudge_overdue, last_run_at, last_run_result, created_at, updated_at)
               VALUES (:team_id, :enabled, :dry_run, :max_actions, :assign, :nudge,
                       :now, CAST(:result AS jsonb), :now, :now)
               ON CONFLICT (team_id) DO UPDATE SET
                 last_run_at = :now, last_run_result = CAST(:result AS jsonb), updated_at = :now"""
        ),
        {
            "team_id": team_id,
            "enabled": settings["enabled"],
            "dry_run": settings["dryRun"],
            "max_actions": settings["maxActionsPerDay"],
            "assign": settings["assignUnassigned"],
            "nudge": settings["nudgeOverdue"],
            "now": now,
            "result": json.dumps(
                {
                    "dryRun": settings["dryRun"],
                    "applied": len(result["applied"]),
                    "nudged": len(result["nudged"]),
                    "wouldApply": len(result["wouldApply"]),
                    "wouldNudge": len(result["wouldNudge"]),
                    "reported": reported,
                }
            ),
        },
    )
    await db.commit()
    return result


@router.get("/{team_id}/dispatcher")
async def dispatcher_settings(
    team_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _member_access(db, workspaceId, user["id"])
    await _require_team(db, team_id, workspaceId)
    return {"data": await get_settings(db, team_id)}


@router.put("/{team_id}/dispatcher")
async def save_dispatcher_settings(
    team_id: str,
    payload: DispatcherSettingsInput,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _manager_access(db, workspaceId, user["id"])
    await _require_team(db, team_id, workspaceId)
    now = _utcnow()
    result = await db.execute(
        text("""INSERT INTO team_dispatcher_settings
               (team_id, enabled, dry_run, max_actions_per_day, assign_unassigned,
                nudge_overdue, created_at, updated_at)
               VALUES (:team_id, :enabled, :dry_run, :max_actions, :assign, :nudge, :now, :now)
               ON CONFLICT (team_id) DO UPDATE SET
                 enabled = :enabled, dry_run = :dry_run, max_actions_per_day = :max_actions,
                 assign_unassigned = :assign, nudge_overdue = :nudge, updated_at = :now
               RETURNING *"""),
        {
            "team_id": team_id,
            "enabled": payload.enabled,
            "dry_run": payload.dryRun,
            "max_actions": payload.maxActionsPerDay,
            "assign": payload.assignUnassigned,
            "nudge": payload.nudgeOverdue,
            "now": now,
        },
    )
    await db.commit()
    return {"data": _settings_view(result.mappings().one(), team_id)}


@router.post("/{team_id}/dispatcher/run")
async def run_dispatcher_now(
    team_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _manager_access(db, workspaceId, user["id"])
    today = hcm_today()
    return {
        "data": await run_team_dispatcher(
            db, team_id, workspaceId, today, dispatch_cutoff_utc()
        )
    }
