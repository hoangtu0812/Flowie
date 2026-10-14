from __future__ import annotations
from typing import Any
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from ...core.errors import ApiError
from ...core.clock import _utcnow
from .issue_queries import _issue_row
from .issue_activity import _write_activity


async def _add_issue_relation(
    db: AsyncSession,
    issue_id: str,
    workspace_id: str,
    related_issue_id: str,
    relation_type: str,
    user_id: str,
) -> dict[str, Any]:
    issue = await _issue_row(db, issue_id, workspace_id, user_id)
    related = await _issue_row(db, related_issue_id, workspace_id, user_id)
    if issue["id"] == related["id"]:
        raise ApiError(400, "An issue cannot be related to itself.", "Bad Request")

    source_issue_id, target_issue_id = (
        sorted((issue["id"], related["id"]))
        if relation_type == "RELATED"
        else (related["id"], issue["id"])
    )
    existing = await db.execute(
        text(
            """SELECT issue_id, related_issue_id, type FROM issue_relations
               WHERE workspace_id = :workspace_id
                 AND ((issue_id = :issue_id AND related_issue_id = :related_issue_id)
                   OR (issue_id = :related_issue_id AND related_issue_id = :issue_id))
               LIMIT 1"""
        ),
        {
            "workspace_id": workspace_id,
            "issue_id": issue["id"],
            "related_issue_id": related["id"],
        },
    )
    previous = existing.mappings().first()
    if previous and (
        previous["type"] == relation_type
        and previous["issue_id"] == source_issue_id
        and previous["related_issue_id"] == target_issue_id
    ):
        return {
            "workspaceId": workspace_id,
            "issueId": previous["issue_id"],
            "relatedIssueId": previous["related_issue_id"],
            "type": previous["type"],
        }

    if previous:
        await db.execute(
            text(
                """UPDATE issue_relations
                   SET issue_id = :source_issue_id, related_issue_id = :target_issue_id,
                       type = :relation_type, created_by = :user_id, created_at = :now
                   WHERE issue_id = :previous_issue_id AND related_issue_id = :previous_related_issue_id"""
            ),
            {
                "source_issue_id": source_issue_id,
                "target_issue_id": target_issue_id,
                "relation_type": relation_type,
                "user_id": user_id,
                "now": _utcnow(),
                "previous_issue_id": previous["issue_id"],
                "previous_related_issue_id": previous["related_issue_id"],
            },
        )
    else:
        await db.execute(
            text(
                """INSERT INTO issue_relations
                   (workspace_id, issue_id, related_issue_id, type, created_at, created_by)
                   VALUES (:workspace_id, :issue_id, :related_issue_id, :relation_type, :now, :user_id)"""
            ),
            {
                "workspace_id": workspace_id,
                "issue_id": source_issue_id,
                "related_issue_id": target_issue_id,
                "relation_type": relation_type,
                "now": _utcnow(),
                "user_id": user_id,
            },
        )

    await _write_activity(
        db,
        workspace_id,
        issue["id"],
        user_id,
        "issue.related",
        {
            "relatedIssueId": related["id"],
            "relatedIdentifier": related["identifier"],
            "relationType": relation_type,
            "relationKind": _relation_kind(relation_type, source_issue_id, issue["id"]),
        },
    )
    await _write_activity(
        db,
        workspace_id,
        related["id"],
        user_id,
        "issue.related",
        {
            "relatedIssueId": issue["id"],
            "relatedIdentifier": issue["identifier"],
            "relationType": relation_type,
            "relationKind": _relation_kind(
                relation_type, source_issue_id, related["id"]
            ),
        },
    )
    await db.commit()
    return {
        "workspaceId": workspace_id,
        "issueId": source_issue_id,
        "relatedIssueId": target_issue_id,
        "type": relation_type,
    }


def _relation_kind(
    relation_type: str, source_issue_id: str, perspective_issue_id: str
) -> str:
    if relation_type == "RELATED":
        return "RELATED"
    return "BLOCKS" if source_issue_id == perspective_issue_id else "BLOCKED_BY"
