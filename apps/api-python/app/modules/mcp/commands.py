from __future__ import annotations

from sqlalchemy import text

from ...core.errors import ApiError
from ...core.identifiers import _cuid
from ..work_items import comments, documents, issues
from ..work_items.contracts import (
    CommentInput,
    CreateCommentInput,
    CreateDocumentInput,
    CreateIssueInput,
    UpdateDocumentInput,
    UpdateIssueInput,
)
from .feature_docs import require_feature_project, upsert_feature_doc
from .policy import AccessPolicy
from .uploads import upload_link


class CommandService:
    def __init__(self, db, principal, settings=None):
        self.db, self.principal, self.settings = db, principal, settings
        self.policy = AccessPolicy(db, principal)
        self.target: dict | None = None
        self.parent_id: str | None = None

    async def prepare(self, name: str, payload) -> None:
        if name == "create_attachment_upload":
            self.target = await self.policy.issue(payload.issueId)
        elif name in {"update_issue", "transition_issue", "add_comment"}:
            self.target = await self.policy.issue(payload.issueId, lock=True)
            if name == "update_issue" and "projectId" in payload.model_fields_set:
                await self.policy.destination(payload.projectId, self.target["team_id"])
            # The parent must be inside this connection's scope; team, archive and cycle rules
            # run in issues.update_issue so MCP and the web app share them.
            # VI: Issue cha phải nằm trong scope của kết nối; quy tắc team, archive và chu trình
            # VI: chạy trong issues.update_issue để MCP và web dùng chung.
            if name == "update_issue" and payload.parentIssueId:
                self.parent_id = (await self.policy.issue(payload.parentIssueId))["id"]
        elif name == "update_comment":
            self.target = await self.policy.comment(payload.commentId, lock=True)
            if self.target["author_id"] != self.principal.user["id"]:
                raise ApiError(403, "Only the comment author can edit it.", "Forbidden")
        elif name in {"update_document", "link_document", "restore_document"}:
            self.target = await self.policy.document(payload.documentId, lock=True)
            if name == "link_document":
                await self.link_target(payload)
        elif name == "upsert_feature_doc":
            self.target = await require_feature_project(self.policy, payload.issueId)
        elif name == "create_issue":
            await self.policy.destination(payload.projectId, payload.teamId)
            if payload.parentIssueId:
                await self.policy.issue(payload.parentIssueId)
            status = (
                await self.db.execute(
                    text("""SELECT category FROM issue_statuses WHERE id=:id
                AND workspace_id=:workspace AND (team_id IS NULL OR team_id=:team)"""),
                    {
                        "id": payload.statusId,
                        "workspace": self.principal.workspace_id,
                        "team": payload.teamId,
                    },
                )
            ).scalar_one_or_none()
            if status in {"COMPLETED", "CANCELED"}:
                self.principal.require("issues:transition")
        elif name == "create_document":
            team_id, project_id = payload.teamId, payload.projectId
            if payload.issueId:
                issue = await self.policy.issue(payload.issueId)
                project_id = issue["project_id"]
                team_id = team_id or issue["team_id"]
                if team_id != issue["team_id"]:
                    raise ApiError(
                        400,
                        "Document and issue must belong to the same team.",
                        "Bad Request",
                    )
            if project_id:
                project = await self.policy.project(project_id)
                team_id = team_id or project["team_id"]
            await self.policy.destination(project_id, team_id)
            self.target = {"team_id": team_id}

    async def link_target(self, payload) -> tuple[str | None, str | None]:
        issue_id, project_id = None, payload.projectId
        if payload.issueId:
            issue = await self.policy.issue(payload.issueId)
            issue_id = issue["id"]
            target_team = issue["team_id"]
        else:
            project = await self.policy.project(project_id)
            target_team = project["team_id"]
        document_team = self.target["team_id"] if self.target else None
        if document_team and document_team != target_team:
            raise ApiError(
                400, "A team document can only link to that team.", "Bad Request"
            )
        return issue_id, project_id

    def check_version(self, payload) -> None:
        if (
            hasattr(payload, "expectedVersion")
            and self.target["version"] != payload.expectedVersion
        ):
            raise ApiError(
                409, "The record changed. Read it again before updating.", "Conflict"
            )

    async def execute(self, name: str, payload) -> dict:
        self.check_version(payload)
        actor, workspace = self.principal.user, self.principal.workspace_id
        values = payload.model_dump(
            exclude_unset=True,
            exclude={
                "idempotencyKey",
                "expectedVersion",
                "issueId",
                "documentId",
                "commentId",
            },
        )
        if name == "create_issue":
            values["parentIssueId"] = (
                (await self.policy.issue(payload.parentIssueId))["id"]
                if payload.parentIssueId
                else None
            )
            return (
                await issues.create_issue(
                    CreateIssueInput(workspaceId=workspace, **values), actor, self.db
                )
            )["data"]
        if name in {"update_issue", "transition_issue"}:
            if name == "transition_issue":
                values = {"statusId": payload.statusId}
            elif not values:
                raise ApiError(
                    400, "At least one update field is required.", "Bad Request"
                )
            elif values.get("parentIssueId"):
                values["parentIssueId"] = self.parent_id
            result = (
                await issues.update_issue(
                    self.target["id"],
                    UpdateIssueInput(**values),
                    workspace,
                    actor,
                    self.db,
                )
            )["data"]
            if name == "transition_issue":
                await comments.create_comment(
                    CreateCommentInput(
                        workspaceId=workspace,
                        issueId=self.target["id"],
                        content=payload.reason,
                    ),
                    actor,
                    self.db,
                )
            return result
        if name == "add_comment":
            return (
                await comments.create_comment(
                    CreateCommentInput(
                        workspaceId=workspace,
                        issueId=self.target["id"],
                        content=payload.content, parentCommentId=payload.parentCommentId, mentionIds=payload.mentionIds,
                    ),
                    actor,
                    self.db,
                )
            )["data"]
        if name == "update_comment":
            return (
                await comments.update_comment(
                    payload.commentId,
                    CommentInput(content=payload.content, expectedVersion=payload.expectedVersion),
                    workspace,
                    actor,
                    self.db,
                )
            )["data"]
        if name == "create_document":
            values.pop("projectId", None)
            values["teamId"] = self.target["team_id"]
            result = (
                await documents.create_document(
                    CreateDocumentInput(workspaceId=workspace, **values), actor, self.db
                )
            )["data"]
            self.target = {"team_id": result["teamId"]}
            if payload.projectId or payload.issueId:
                await self.add_link(result["id"], payload)
            return result
        if name in {"update_document", "restore_document"}:
            if name == "restore_document":
                revision = (
                    (
                        await self.db.execute(
                            text(
                                "SELECT title,content FROM document_revisions WHERE document_id=:id AND version=:version"
                            ),
                            {
                                "id": payload.documentId,
                                "version": payload.revisionVersion,
                            },
                        )
                    )
                    .mappings()
                    .first()
                )
                if not revision:
                    raise ApiError(404, "Revision not found.", "Not Found")
                values = dict(revision)
            if not values or any(value is None for value in values.values()):
                raise ApiError(
                    400,
                    "Provide a non-null title, content, docType or status.",
                    "Bad Request",
                )
            return (
                await documents.update_document(
                    payload.documentId,
                    UpdateDocumentInput(**values),
                    workspace,
                    actor,
                    self.db,
                )
            )["data"]
        if name == "upsert_feature_doc":
            return await upsert_feature_doc(self.db, self.principal, self.target, payload)
        if name == "create_attachment_upload":
            return upload_link(self.settings, self.principal, self.target, payload.filename)
        if name == "link_document":
            await self.add_link(payload.documentId, payload)
            return {"documentId": payload.documentId, "linked": True}
        raise ApiError(404, "Tool not found.", "Not Found")

    async def add_link(self, document_id: str, payload) -> None:
        issue_id, project_id = await self.link_target(payload)
        await self.db.execute(
            text("""INSERT INTO document_links (id,document_id,workspace_id,project_id,issue_id)
            VALUES (:id,:document,:workspace,:project,:issue) ON CONFLICT DO NOTHING"""),
            {
                "id": _cuid(),
                "document": document_id,
                "workspace": self.principal.workspace_id,
                "project": project_id,
                "issue": issue_id,
            },
        )
