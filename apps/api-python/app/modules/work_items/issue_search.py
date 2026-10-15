from __future__ import annotations

import json
import unicodedata
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.errors import ApiError
from ...core.pagination import CursorCodec, literal_search
from .issue_queries import _issue_rows

OPTION_COLUMNS = {
    "status": "i.status_id",
    "statusType": "lower(s.category::text)",
    "assignee": "COALESCE(i.assignee_id,'unassigned')",
    "project": "COALESCE(i.project_id,'')",
    "priority": "CASE WHEN i.priority='NONE' THEN 'no-priority' ELSE lower(i.priority::text) END",
    "issueType": "i.issue_type::text",
    "severity": "COALESCE(i.severity::text,'NONE')",
    "cycle": "COALESCE((SELECT cycle_id FROM issue_cycles ic WHERE ic.issue_id=i.id ORDER BY created_at,cycle_id LIMIT 1),'no-cycle')",
}
VIETNAMESE = "đàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ"
NORMALIZED = "".join(
    "d" if char == "đ" else unicodedata.normalize("NFD", char)[0] for char in VIETNAMESE
)
VIETNAMESE += VIETNAMESE.upper()
NORMALIZED += NORMALIZED


class IssueFilter(BaseModel):
    columnId: str = Field(max_length=30)
    type: str = Field(max_length=30)
    operator: str = Field(max_length=40)
    values: list[str] = Field(max_length=100)


def filter_sql(raw: str | None) -> tuple[list[str], dict]:
    clauses, params = [], {}
    try:
        parsed = json.loads(raw) if raw else []
        if not isinstance(parsed, list) or len(parsed) > 20:
            raise ValueError
        filters = [IssueFilter.model_validate(item) for item in parsed]
    except (ValueError, ValidationError) as error:
        raise ApiError(400, "Invalid issue filters.", "Bad Request") from error
    for index, item in enumerate(filters):
        if not item.values:
            continue
        if any(len(value) > 100 for value in item.values):
            raise ApiError(400, "Filter values are too long.", "Bad Request")
        key = f"filter_{index}"
        params[key] = item.values
        if item.type == "option" and item.columnId in OPTION_COLUMNS:
            if item.operator not in {"is", "is any of", "is not", "is none of"}:
                raise ApiError(400, "Unsupported issue filter operator.", "Bad Request")
            expression = OPTION_COLUMNS[item.columnId]
            comparison = f"({expression})=ANY(CAST(:{key} AS text[]))"
            if item.operator in {"is not", "is none of"}:
                comparison = f"NOT ({comparison})"
            clauses.append(f"(({expression})<>'' AND {comparison})")
        elif item.type == "multiOption" and item.columnId == "labels":
            count = f"(SELECT COUNT(DISTINCT il.label_id) FROM issue_labels il WHERE il.issue_id=i.id AND il.label_id=ANY(CAST(:{key} AS text[])))"
            comparisons = {
                "include": f"{count}>0",
                "include any of": f"{count}>0",
                "exclude": f"{count}=0",
                "exclude if any of": f"{count}=0",
                "include all of": f"{count}=cardinality(CAST(:{key} AS text[]))",
                "exclude if all": f"{count}<cardinality(CAST(:{key} AS text[]))",
            }
            if item.operator not in comparisons:
                raise ApiError(400, "Unsupported label filter operator.", "Bad Request")
            clauses.append(comparisons[item.operator])
        else:
            raise ApiError(400, "Unsupported issue filter.", "Bad Request")
    return clauses, params


def issue_scope(workspace: str, user: str, options: dict) -> tuple[str, dict]:
    filters, extra = filter_sql(options.get("filters"))
    clauses = [
        "i.workspace_id=:workspace",
        "i.archived_at IS NULL",
        "t.archived_at IS NULL",
        "EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=i.team_id AND tm.user_id=:user)",
    ]
    params = {"workspace": workspace, "user": user, **extra}
    for field, column in {
        "teamId": "team_id",
        "projectId": "project_id",
        "assigneeId": "assignee_id",
        "creatorId": "creator_id",
    }.items():
        if options.get(field):
            clauses.append(f"i.{column}=:{field}")
            params[field] = options[field]
    if options.get("cycleId"):
        clauses.append(
            "EXISTS(SELECT 1 FROM issue_cycles ic WHERE ic.issue_id=i.id AND ic.cycle_id=:cycle)"
        )
        params["cycle"] = options["cycleId"]
    if not options.get("includeSubIssues", True):
        clauses.append("i.parent_issue_id IS NULL")
    if options.get("categories"):
        categories = [
            value.upper() for value in options["categories"].split(",") if value
        ]
        if set(categories) - {
            "TRIAGE",
            "BACKLOG",
            "UNSTARTED",
            "STARTED",
            "COMPLETED",
            "CANCELED",
        }:
            raise ApiError(400, "Invalid workflow categories.", "Bad Request")
        clauses.append("s.category::text=ANY(CAST(:categories AS text[]))")
        params["categories"] = categories
    scope = options.get("scope")
    scopes = {
        "assigned": "i.assignee_id=:user",
        "created": "i.creator_id=:user",
        "subscribed": "EXISTS(SELECT 1 FROM issue_subscriptions sub WHERE sub.issue_id=i.id AND sub.user_id=:user)",
        "activity": "(i.assignee_id=:user OR i.creator_id=:user OR EXISTS(SELECT 1 FROM issue_subscriptions sub WHERE sub.issue_id=i.id AND sub.user_id=:user) OR EXISTS(SELECT 1 FROM activities a WHERE a.issue_id=i.id AND a.actor_id=:user))",
    }
    if scope:
        if scope not in scopes:
            raise ApiError(400, "Invalid personal issue scope.", "Bad Request")
        clauses.append(scopes[scope])
    if options.get("query"):
        query = "".join(
            char
            for char in unicodedata.normalize(
                "NFD", options["query"].lower().replace("đ", "d")
            )
            if not unicodedata.combining(char)
        )
        clauses.append(
            f"translate(lower(i.identifier || ' ' || i.title || ' ' || COALESCE(i.description,'')), '{VIETNAMESE}', '{NORMALIZED}') LIKE :query ESCAPE '\\'"
        )
        params["query"] = literal_search(query)
    clauses.extend(filters)
    sql = f"FROM issues i JOIN teams t ON t.id=i.team_id JOIN issue_statuses s ON s.id=i.status_id WHERE {' AND '.join(clauses)}"
    return sql, params


async def search_page(
    db: AsyncSession, workspace: str, user: str, secret: str, options: dict
) -> dict:
    sql, params = issue_scope(workspace, user, options)
    total = (await db.execute(text("SELECT COUNT(*) " + sql), params)).scalar_one()
    codec = CursorCodec(
        secret,
        f"{user}:{workspace}",
        "web_issues",
        {key: value for key, value in options.items() if key != "cursor"},
    )
    cursor_clause = ""
    if options.get("cursor"):
        timestamp, identifier = codec.decode(options["cursor"])
        cursor_clause = " AND (i.created_at,i.id)<(:cursor_time,:cursor_id)"
        params.update(cursor_time=timestamp, cursor_id=identifier)
    limit = options.get("limit", 100)
    rows = (
        (
            await db.execute(
                text(
                    "SELECT i.id,i.created_at "
                    + sql
                    + cursor_clause
                    + " ORDER BY i.created_at DESC,i.id DESC LIMIT :limit"
                ),
                {**params, "limit": limit + 1},
            )
        )
        .mappings()
        .all()
    )
    page = rows[:limit]
    next_cursor = (
        codec.encode(page[-1]["created_at"], page[-1]["id"])
        if len(rows) > limit
        else None
    )
    return {
        "data": await _issue_rows(db, [row["id"] for row in page], workspace, user),
        "meta": {"total": total, "limit": limit, "nextCursor": next_cursor},
    }
