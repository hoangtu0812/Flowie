from __future__ import annotations

"""Deterministic team workload, assignment suggestions and the daily digest.

Phase 1 of the autonomous dispatcher deliberately uses no LLM: every number
comes from SQL so the workload score, the suggested assignee and the Discord
digest are reproducible and auditable. The agent layer can later explain these
same payloads; it must never recompute them.
"""

import logging
from datetime import UTC, datetime, timedelta
from os import getenv
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from fastapi import Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ...core.clock import utcnow
from ...core.errors import ApiError
from ...core.utc_responses import UtcAPIRouter as APIRouter
from ...db.session import get_session
from ..identity.auth import current_user
from .commands import (
    SEND_DIGEST_FOR_WORKSPACE_UPDATE_DISCORD_WEBHOOKS,
)
from .queries import (
    APP_LINKS_SELECT_WORKSPACES,
    ISSUE_LABELS_SELECT_ISSUE_LABELS,
    MANAGER_ACCESS_SELECT_WORKSPACE_MEMBERS_2,
    MEMBER_ACCESS_SELECT_WORKSPACE_MEMBERS_2,
    MEMBER_TOP_LABELS_SELECT_ISSUES,
    OPEN_TEAM_ISSUES_SELECT_ISSUES,
    RECENT_COMPLETIONS_SELECT_ISSUES,
    REQUIRE_TEAM_SELECT_TEAMS_2,
    SEND_DIGEST_FOR_WORKSPACE_SELECT_DISCORD_WEBHOOKS,
    TEAM_MEMBERS_SELECT_TEAM_MEMBERS,
    VELOCITIES_SELECT_ISSUES,
    WORKSPACE_OPEN_ISSUES_SELECT_ISSUES,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/teams", tags=["team-insights"])
digest_router = APIRouter(prefix="/api/v1/digest", tags=["digest"])

HCM = ZoneInfo("Asia/Ho_Chi_Minh")
DIGEST_HOUR = 8
OPEN_CATEGORIES = ("TRIAGE", "BACKLOG", "UNSTARTED", "STARTED")
PRIORITY_WEIGHTS = {"URGENT": 3.0, "HIGH": 2.0, "MEDIUM": 1.0, "LOW": 0.5, "NONE": 0.0}
OVERDUE_WEIGHT = 2.0
SKILL_MATCH_BONUS = 1.5
VELOCITY_WINDOW_DAYS = 28
SKILL_WINDOW_DAYS = 90
RECENT_WINDOW_DAYS = 7
DUE_SOON_DAYS = 3


def hcm_today(value: datetime | None = None) -> str:
    return (value or utcnow()).astimezone(HCM).date().isoformat()


async def _app_links(
    db: AsyncSession, workspace_id: str
) -> tuple[str | None, str | None]:
    """Base app URL and stable workspace ID for Discord links.

    Discord rejects a whole embed when a link is not absolute, so callers
    must fall back to plain text whenever either part is missing.
    """
    base = (getenv("APP_URL") or getenv("NEXT_PUBLIC_APP_URL") or "").rstrip("/")
    result = await db.execute(
        APP_LINKS_SELECT_WORKSPACES,
        {"workspace_id": workspace_id},
    )
    return (base or None, result.scalar_one_or_none())


def issue_link(
    base: str | None, slug: str | None, identifier: str, title: str = ""
) -> str:
    """Issue identifier as a Discord markdown link, or plain text without a base."""
    if base and slug:
        label = f"{identifier} {title}".strip()
        return f"[{label}]({base}/{slug}/issue/{identifier})"
    return f"{identifier} {title}".strip()


def project_link(
    base: str | None, slug: str | None, project_id: str | None, name: str
) -> str:
    """Project name as a Discord markdown link, or plain text without a base."""
    if base and slug and project_id:
        return f"[{name}]({base}/{slug}/project/{project_id}/overview)"
    return name


def workload_score(
    est_open: float, priority_counts: dict[str, int], overdue_count: int
) -> float:
    """Deterministic load score: remaining effort + priority pressure + overdue penalty."""
    priority_load = sum(
        PRIORITY_WEIGHTS.get(priority, 0.0) * count
        for priority, count in priority_counts.items()
    )
    return round(
        (est_open or 0.0) + priority_load + OVERDUE_WEIGHT * (overdue_count or 0), 2
    )


def load_band(score: float, weekly_velocity: float) -> str:
    """Coarse band comparing current load against demonstrated weekly throughput."""
    if not weekly_velocity or weekly_velocity <= 0:
        return "unknown"
    ratio = score / weekly_velocity
    if ratio < 0.8:
        return "healthy"
    if ratio < 1.2:
        return "busy"
    return "overloaded"


def pick_candidate(
    candidates: list[dict[str, Any]], issue_label_ids: set[str]
) -> tuple[dict[str, Any], list[str]]:
    """Lowest adjusted score wins; shared labels with past completions reduce the score."""
    best: dict[str, Any] | None = None
    best_key = 0.0
    best_matched: list[str] = []
    for candidate in candidates:
        matched = [
            label["name"]
            for label in candidate.get("top_labels", [])
            if label["id"] in issue_label_ids
        ]
        adjusted = candidate["score"] - SKILL_MATCH_BONUS * len(matched)
        if best is None or adjusted < best_key:
            best, best_key, best_matched = candidate, adjusted, matched
    assert best is not None
    return best, best_matched


def seconds_until_next_digest(now: datetime | None = None) -> float:
    """Seconds from now until the next 08:00 Asia/Ho_Chi_Minh digest run."""
    current = (now or utcnow()).astimezone(HCM)
    target = current.replace(hour=DIGEST_HOUR, minute=0, second=0, microsecond=0)
    if target <= current:
        target += timedelta(days=1)
    return max((target - current).total_seconds(), 1.0)


def digest_cutoff_utc(now: datetime | None = None) -> datetime:
    """Start of today's digest window (08:00 +07) as naive UTC.

    Timestamp columns are `timestamp without time zone`, so the cutoff must
    stay offset-naive like `utcnow()` or asyncpg refuses the comparison.
    A workspace whose digest was sent at or after this instant already
    received today's report, so restarts never double-send.
    """
    current = (now or utcnow()).astimezone(HCM)
    return (
        current.replace(hour=DIGEST_HOUR, minute=0, second=0, microsecond=0)
        .astimezone(UTC)
        .replace(tzinfo=None)
    )


async def _member_access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(
        MEMBER_ACCESS_SELECT_WORKSPACE_MEMBERS_2,
        {"workspace_id": workspace_id, "user_id": user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(403, "You do not have access to this workspace.", "Forbidden")


async def _manager_access(db: AsyncSession, workspace_id: str, user_id: str) -> None:
    result = await db.execute(
        MANAGER_ACCESS_SELECT_WORKSPACE_MEMBERS_2,
        {"workspace_id": workspace_id, "user_id": user_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(403, "Workspace administrator access is required.", "Forbidden")


async def _require_team(db: AsyncSession, team_id: str, workspace_id: str) -> None:
    result = await db.execute(
        REQUIRE_TEAM_SELECT_TEAMS_2,
        {"team_id": team_id, "workspace_id": workspace_id},
    )
    if result.scalar_one_or_none() is None:
        raise ApiError(404, "Team not found.", "Not Found")


async def _team_members(db: AsyncSession, team_id: str) -> list[dict[str, Any]]:
    result = await db.execute(
        TEAM_MEMBERS_SELECT_TEAM_MEMBERS,
        {"team_id": team_id},
    )
    return [dict(row) for row in result.mappings().all()]


async def _open_team_issues(db: AsyncSession, team_id: str) -> list[dict[str, Any]]:
    result = await db.execute(
        OPEN_TEAM_ISSUES_SELECT_ISSUES,
        {"team_id": team_id},
    )
    return [dict(row) for row in result.mappings().all()]


async def _velocities(
    db: AsyncSession, team_id: str, since: datetime
) -> dict[str, float]:
    result = await db.execute(
        VELOCITIES_SELECT_ISSUES,
        {"team_id": team_id, "since": since},
    )
    return {
        row["assignee_id"]: row["done"] / (VELOCITY_WINDOW_DAYS / 7)
        for row in result.mappings().all()
    }


async def _member_top_labels(
    db: AsyncSession, team_id: str, since: datetime
) -> dict[str, list[dict[str, str]]]:
    result = await db.execute(
        MEMBER_TOP_LABELS_SELECT_ISSUES,
        {"team_id": team_id, "since": since},
    )
    top: dict[str, list[dict[str, str]]] = {}
    for row in result.mappings().all():
        entries = top.setdefault(row["assignee_id"], [])
        if len(entries) < 5:
            entries.append({"id": row["label_id"], "name": row["label_name"]})
    return top


async def _issue_labels(
    db: AsyncSession, issue_ids: list[str]
) -> dict[str, list[dict[str, str]]]:
    if not issue_ids:
        return {}
    result = await db.execute(
        ISSUE_LABELS_SELECT_ISSUE_LABELS,
        {"issue_ids": issue_ids},
    )
    grouped: dict[str, list[dict[str, str]]] = {}
    for row in result.mappings().all():
        grouped.setdefault(row["issue_id"], []).append(
            {"id": row["label_id"], "name": row["label_name"]}
        )
    return grouped


def _member_workload(
    user_id: str,
    name: str,
    avatar_url: str | None,
    role: str,
    issues: list[dict[str, Any]],
    today: str,
    velocity: float,
    top_labels: list[dict[str, str]],
) -> dict[str, Any]:
    priority_counts: dict[str, int] = {}
    est_open = 0.0
    overdue = 0
    for issue in issues:
        priority_counts[issue["priority"]] = (
            priority_counts.get(issue["priority"], 0) + 1
        )
        est_open += issue["estimated_effort"] or 0.0
        due = issue["due_date"].date().isoformat() if issue["due_date"] else None
        if due and due < today:
            overdue += 1
    score = workload_score(est_open, priority_counts, overdue)
    return {
        "userId": user_id,
        "name": name,
        "avatarUrl": avatar_url,
        "role": role,
        "openCount": len(issues),
        "estOpen": round(est_open, 2),
        "overdueCount": overdue,
        "priorities": priority_counts,
        "score": score,
        "weeklyVelocity": round(velocity, 2),
        "band": load_band(score, velocity),
        "topLabels": top_labels,
    }


async def workload_report(
    db: AsyncSession, team_id: str, workspace_id: str, today: str
) -> dict[str, Any]:
    await _require_team(db, team_id, workspace_id)
    members = await _team_members(db, team_id)
    open_issues = await _open_team_issues(db, team_id)
    since_velocity = utcnow() - timedelta(days=VELOCITY_WINDOW_DAYS)
    since_skill = utcnow() - timedelta(days=SKILL_WINDOW_DAYS)
    velocities, top_labels = await _velocities(
        db, team_id, since_velocity
    ), await _member_top_labels(db, team_id, since_skill)
    by_assignee: dict[str, list[dict[str, Any]]] = {}
    for issue in open_issues:
        if issue["assignee_id"]:
            by_assignee.setdefault(issue["assignee_id"], []).append(issue)
    entries = [
        _member_workload(
            member["user_id"],
            member["name"],
            member["avatar_url"],
            member["role"],
            by_assignee.get(member["user_id"], []),
            today,
            velocities.get(member["user_id"], 0.0),
            top_labels.get(member["user_id"], []),
        )
        for member in members
    ]
    average = (
        round(sum(entry["score"] for entry in entries) / len(entries), 2)
        if entries
        else 0.0
    )
    return {
        "teamId": team_id,
        "today": today,
        "members": entries,
        "teamAverageScore": average,
    }


async def assignment_suggestions(
    db: AsyncSession, team_id: str, workspace_id: str, today: str, limit: int
) -> dict[str, Any]:
    report = await workload_report(db, team_id, workspace_id, today)
    open_issues = await _open_team_issues(db, team_id)
    unassigned = [issue for issue in open_issues if not issue["assignee_id"]]
    unassigned.sort(
        key=lambda issue: (
            not (
                issue["due_date"].date().isoformat() < today
                if issue["due_date"]
                else False
            ),
            -PRIORITY_WEIGHTS.get(issue["priority"], 0.0),
            issue["created_at"],
        )
    )
    labels = await _issue_labels(db, [issue["id"] for issue in unassigned[:limit]])
    candidates = [
        {
            "user_id": entry["userId"],
            "name": entry["name"],
            "score": entry["score"],
            "top_labels": entry["topLabels"],
        }
        for entry in report["members"]
    ]
    suggestions: list[dict[str, Any]] = []
    if candidates:
        for issue in unassigned[:limit]:
            issue_labels = labels.get(issue["id"], [])
            chosen, matched = pick_candidate(
                candidates, {label["id"] for label in issue_labels}
            )
            chosen["score"] = round(
                chosen["score"] + (issue["estimated_effort"] or 0.0), 2
            )
            reason = f"Lowest current load (score {chosen['score']})"
            if matched:
                reason += f" + matched: {', '.join(matched)}"
            suggestions.append(
                {
                    "issueId": issue["id"],
                    "identifier": issue["identifier"],
                    "title": issue["title"],
                    "priority": issue["priority"],
                    "estimatedEffort": issue["estimated_effort"],
                    "labels": issue_labels,
                    "suggestedUserId": chosen["user_id"],
                    "suggestedUserName": chosen["name"],
                    "reason": reason,
                    "scoreAfter": chosen["score"],
                }
            )
    return {
        "teamId": team_id,
        "today": today,
        "unassignedTotal": len(unassigned),
        "suggestions": suggestions,
    }


async def _workspace_open_issues(
    db: AsyncSession, workspace_id: str
) -> list[dict[str, Any]]:
    result = await db.execute(
        WORKSPACE_OPEN_ISSUES_SELECT_ISSUES,
        {"workspace_id": workspace_id},
    )
    return [dict(row) for row in result.mappings().all()]


async def _recent_completions(
    db: AsyncSession, workspace_id: str, since: datetime
) -> dict[str, int]:
    result = await db.execute(
        RECENT_COMPLETIONS_SELECT_ISSUES,
        {"workspace_id": workspace_id, "since": since},
    )
    return {row["project_id"]: row["done"] for row in result.mappings().all()}


async def build_digest(
    db: AsyncSession, workspace_id: str, today: str
) -> dict[str, Any]:
    open_issues = await _workspace_open_issues(db, workspace_id)
    since = utcnow() - timedelta(days=RECENT_WINDOW_DAYS)
    done_recent = await _recent_completions(db, workspace_id, since)
    soon_limit = (
        (datetime.fromisoformat(today) + timedelta(days=DUE_SOON_DAYS))
        .date()
        .isoformat()
    )
    projects: dict[str, dict[str, Any]] = {}
    for issue in open_issues:
        key = issue["project_id"] or "no-project"
        entry = projects.setdefault(
            key,
            {
                "projectId": None if key == "no-project" else key,
                "projectName": issue["project_name"] or "No project",
                "open": 0,
                "done7d": done_recent.get(key, 0),
                "overdue": [],
                "dueSoon": [],
                "unassigned": [],
            },
        )
        entry["open"] += 1
        due = issue["due_date"].date().isoformat() if issue["due_date"] else None
        brief = {
            "identifier": issue["identifier"],
            "title": issue["title"],
            "assignee": issue["assignee_name"],
            "dueDate": due,
            "priority": issue["priority"],
        }
        if due and due < today:
            entry["overdue"].append(brief)
        elif due and due <= soon_limit:
            entry["dueSoon"].append(brief)
        if not issue["assignee_id"]:
            entry["unassigned"].append(brief)
    for entry in projects.values():
        entry["overdue"].sort(
            key=lambda item: (item["dueDate"] or "", item["identifier"])
        )
        entry["dueSoon"].sort(
            key=lambda item: (item["dueDate"] or "", item["identifier"])
        )
        entry["status"] = (
            "late"
            if entry["overdue"]
            else (
                "needs_attention"
                if (entry["unassigned"] or entry["dueSoon"])
                else "on_track"
            )
        )
    ordered = sorted(
        projects.values(),
        key=lambda entry: (
            entry["status"] != "late",
            entry["status"] != "needs_attention",
            -entry["open"],
        ),
    )
    actions: list[dict[str, str]] = []
    for entry in ordered:
        for item in entry["overdue"][:5]:
            owner = item["assignee"] or "chưa gán"
            actions.append(
                {
                    "icon": "🔴",
                    "identifier": item["identifier"],
                    "title": item["title"],
                    "detail": f"quá hạn từ {item['dueDate']} ({owner}) — dời due date hoặc tăng người.",
                }
            )
        for item in entry["unassigned"][:5]:
            actions.append(
                {
                    "icon": "🟡",
                    "identifier": item["identifier"],
                    "title": item["title"],
                    "detail": "chưa có người phụ trách — dùng gợi ý phân bổ của team.",
                }
            )
    return {
        "today": today,
        "openTotal": len(open_issues),
        "done7d": sum(done_recent.values()),
        "projects": ordered,
        "actions": actions[:10],
    }


def digest_embeds(
    digest: dict[str, Any], base: str | None = None, slug: str | None = None
) -> list[dict[str, Any]]:
    status_icon = {"on_track": "🟢", "needs_attention": "🟡", "late": "🔴"}
    status_label = {
        "on_track": "Đúng tiến độ",
        "needs_attention": "Cần chú ý",
        "late": "Trễ",
    }
    lines = [
        f"📊 **Báo cáo tiến độ ngày {digest['today']}**",
        f"Mở: {digest['openTotal']} · Xong 7 ngày: {digest['done7d']}",
        "",
    ]
    for entry in digest["projects"]:
        lines.append(
            f"{status_icon[entry['status']]} **{project_link(base, slug, entry['projectId'], entry['projectName'])}** — {status_label[entry['status']]}"
            f" (mở {entry['open']}, trễ {len(entry['overdue'])}, chưa gán {len(entry['unassigned'])})"
        )
        for item in entry["overdue"][:3]:
            lines.append(
                f"  • 🔴 {issue_link(base, slug, item['identifier'], item['title'][:60])} ({item['assignee'] or 'chưa gán'}, due {item['dueDate']})"
            )
    if digest["actions"]:
        lines += ["", "**Khuyến nghị:**"]
        lines += [
            f"{index + 1}. {action['icon']} {issue_link(base, slug, action['identifier'], action['title'])} {action['detail']}"
            for index, action in enumerate(digest["actions"])
        ]
    description = "\n".join(lines)[:4000]
    return [
        {"title": "Flowie daily digest", "color": 0x5E6AD2, "description": description}
    ]


async def send_digest_for_workspace(
    db: AsyncSession, workspace_id: str, today: str
) -> bool:
    webhook = await db.execute(
        SEND_DIGEST_FOR_WORKSPACE_SELECT_DISCORD_WEBHOOKS,
        {"workspace_id": workspace_id},
    )
    url = webhook.scalar_one_or_none()
    if not url:
        return False
    digest = await build_digest(db, workspace_id, today)
    base, slug = await _app_links(db, workspace_id)
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            response = await client.post(
                url, json={"embeds": digest_embeds(digest, base, slug)}
            )
        if not response.is_success:
            logger.warning(
                "Daily digest rejected by Discord for %s: %s",
                workspace_id,
                response.status_code,
            )
            return False
    except httpx.HTTPError as error:
        logger.warning("Daily digest unreachable for %s: %s", workspace_id, error)
        return False
    await db.execute(
        SEND_DIGEST_FOR_WORKSPACE_UPDATE_DISCORD_WEBHOOKS,
        {"now": utcnow(), "workspace_id": workspace_id},
    )
    await db.commit()
    return True


@router.get("/{team_id}/workload")
async def team_workload(
    team_id: str,
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _member_access(db, workspaceId, user["id"])
    return {"data": await workload_report(db, team_id, workspaceId, hcm_today())}


@router.get("/{team_id}/assignment-suggestions")
async def team_assignment_suggestions(
    team_id: str,
    workspaceId: str = Query(min_length=1),
    limit: int = Query(default=20, ge=1, le=50),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _member_access(db, workspaceId, user["id"])
    return {
        "data": await assignment_suggestions(
            db, team_id, workspaceId, hcm_today(), limit
        )
    }


@digest_router.get("/preview")
async def digest_preview(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _member_access(db, workspaceId, user["id"])
    return {"data": await build_digest(db, workspaceId, hcm_today())}


@digest_router.post("/send")
async def digest_send(
    workspaceId: str = Query(min_length=1),
    user: Any = Depends(current_user),
    db: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    await _manager_access(db, workspaceId, user["id"])
    sent = await send_digest_for_workspace(db, workspaceId, hcm_today())
    if not sent:
        return {
            "data": {
                "sent": False,
                "reason": "Daily digest is off or Discord is unreachable.",
            }
        }
    return {"data": {"sent": True}}
