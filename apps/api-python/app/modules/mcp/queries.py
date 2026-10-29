from __future__ import annotations

import base64
from datetime import timezone

from sqlalchemy import text
from ...core.errors import ApiError

from ...core.clock import _utcnow
from .pagination import CursorCodec, literal_search
from .policy import AccessPolicy


IMAGE_TYPES = frozenset({"image/png", "image/jpeg", "image/gif", "image/webp"})
IMAGE_LIMIT = 5 * 1048576


class QueryService:
    def __init__(self, db, principal, settings):
        self.db, self.principal, self.settings = db, principal, settings
        self.policy = AccessPolicy(db, principal)

    async def page(
        self,
        tool: str,
        payload,
        sql: str,
        params: dict,
        *,
        time_field: str = "updatedAt",
    ) -> dict:
        filters = payload.model_dump(mode="json", exclude={"cursor", "limit"})
        codec = CursorCodec(
            self.settings.auth_jwt_secret, self.principal.connection_id, tool, filters
        )
        cursor_clause = ""
        if payload.cursor:
            timestamp, identifier = codec.decode(payload.cursor)
            cursor_clause = (
                f'AND (result."{time_field}",result.id)<(:cursor_time,:cursor_id)'
            )
            params.update(cursor_time=timestamp, cursor_id=identifier)
        rows = list(
            (
                await self.db.execute(
                    text(f'''SELECT * FROM ({sql}) result WHERE TRUE {cursor_clause}
            ORDER BY result."{time_field}" DESC,result.id DESC LIMIT :limit'''),
                    {**self.policy.params, **params, "limit": payload.limit + 1},
                )
            ).mappings()
        )
        more, items = (
            len(rows) > payload.limit,
            [dict(row) for row in rows[: payload.limit]],
        )
        next_cursor = (
            codec.encode(items[-1][time_field], items[-1]["id"]) if more else None
        )
        return {"items": items, "nextCursor": next_cursor, "truncated": more}

    async def bug_template(self, payload) -> dict:
        from ..work_items.bug_template import BUG_TEMPLATE

        return BUG_TEMPLATE

    async def _authorized_attachment(self, attachment_id: str):
        """Loads an attachment only after the connection may read the record it belongs to.

        VI: Chỉ tải tệp đính kèm sau khi connection có quyền đọc bản ghi chứa nó.
        """
        row = (
            (
                await self.db.execute(
                    text(
                        "SELECT * FROM attachments WHERE id=:id AND workspace_id=:workspace"
                    ),
                    {
                        "id": attachment_id,
                        "workspace": self.principal.workspace_id,
                    },
                )
            )
            .mappings()
            .first()
        )
        if not row:
            raise ApiError(404, "Attachment not found.", "Not Found")
        if row["entity_type"] == "issue":
            await self.policy.issue(row["entity_id"])
        elif row["entity_type"] == "comment":
            self.principal.require("comments:read")
            await self.policy.comment(row["entity_id"])
        elif row["entity_type"] == "document":
            self.principal.require("documents:read")
            await self.policy.document(row["entity_id"])
        elif row["entity_type"] == "project":
            self.principal.require("projects:read")
            await self.policy.project(row["entity_id"])
        else:
            raise ApiError(
                415,
                "This attachment target is not supported.",
                "Unsupported Media Type",
            )
        return row

    async def attachment(self, payload) -> dict:
        from ...storage.minio import MinioStorage

        row = await self._authorized_attachment(payload.attachmentId)
        mime = row["mime_type"].split(";", 1)[0].lower()
        suffix = row["filename"].rsplit(".", 1)[-1].lower()
        if not (
            mime.startswith("text/")
            or mime == "application/json"
            or (
                mime == "application/octet-stream"
                and suffix in {"txt", "log", "md", "csv", "json"}
            )
        ):
            raise ApiError(
                415,
                "Only UTF-8 text attachments are supported.",
                "Unsupported Media Type",
            )
        if row["size"] > 1048576:
            raise ApiError(
                413, "Text attachments must be at most 1 MiB.", "Payload Too Large"
            )
        body = await MinioStorage(self.settings).get(row["object_key"])
        if len(body) > 1048576:
            raise ApiError(
                413, "Text attachments must be at most 1 MiB.", "Payload Too Large"
            )
        try:
            content = body.decode("utf-8-sig")
        except UnicodeDecodeError as error:
            raise ApiError(
                415, "The attachment is not UTF-8 text.", "Unsupported Media Type"
            ) from error
        end = payload.offset + payload.limit
        return {
            "attachmentId": row["id"],
            "filename": row["filename"],
            "text": content[payload.offset : end],
            "nextOffset": end if end < len(content) else None,
            "truncated": end < len(content),
        }

    async def attachment_image(self, payload) -> dict:
        """Returns an image attachment as base64 so the transport can send it as MCP image content.

        Only formats that vision models accept are served, and the 5 MiB cap is checked on the
        stored size and again on the downloaded bytes, matching the text reader's two checks.
        VI: Trả ảnh đính kèm dạng base64 để transport gửi thành nội dung ảnh MCP. Chỉ phục vụ
        VI: định dạng mà model thị giác nhận, và giới hạn 5 MiB được kiểm tra trên kích thước
        VI: đã lưu lẫn số byte tải về, giống hai lần kiểm tra của bộ đọc text.
        """
        from ...storage.minio import MinioStorage

        row = await self._authorized_attachment(payload.attachmentId)
        mime = row["mime_type"].split(";", 1)[0].lower()
        if mime not in IMAGE_TYPES:
            raise ApiError(
                415,
                "Only PNG, JPEG, GIF and WebP image attachments are supported.",
                "Unsupported Media Type",
            )
        if row["size"] > IMAGE_LIMIT:
            raise ApiError(413, "Image attachments must be at most 5 MiB.", "Payload Too Large")
        body = await MinioStorage(self.settings).get(row["object_key"])
        if len(body) > IMAGE_LIMIT:
            raise ApiError(413, "Image attachments must be at most 5 MiB.", "Payload Too Large")
        return {
            "attachmentId": row["id"],
            "filename": row["filename"],
            "mimeType": mime,
            "size": len(body),
            "imageBase64": base64.b64encode(body).decode("ascii"),
        }

    async def projects(self, payload) -> dict:
        return await self.page(
            "list_projects",
            payload,
            f"""SELECT p.id,p.name,p.identifier,p.description,
            p.team_id AS "teamId",p.status,p.updated_at AS "updatedAt"
            FROM projects p WHERE {self.policy.project_read_clause()}""",
            {},
        )

    async def teams(self, payload) -> dict:
        return await self.page(
            "list_teams",
            payload,
            f"""SELECT t.id,t.name,t.identifier,t.updated_at AS "updatedAt"
            FROM teams t WHERE t.workspace_id=:workspace AND t.archived_at IS NULL
            AND {self.policy.team_clause("t.id")}
            AND (:all_projects OR EXISTS(SELECT 1 FROM projects p WHERE p.team_id=t.id
                AND p.workspace_id=:workspace AND p.archived_at IS NULL AND {self.policy.project_clause("p.id")}))""",
            {},
        )

    async def issues(self, payload) -> dict:
        params, filters = {}, []
        for field, column in {
            "issueType": "issue_type",
            "severity": "severity",
            "projectId": "project_id",
            "teamId": "team_id",
            "statusId": "status_id",
            "assigneeId": "assignee_id",
            "priority": "priority",
        }.items():
            value = getattr(payload, field)
            if value is not None:
                filters.append(f"i.{column}=:filter_{field}")
                params[f"filter_{field}"] = value
        if payload.category:
            filters.append("s.category=:category")
            params["category"] = payload.category
        if payload.labelId:
            filters.append(
                "EXISTS(SELECT 1 FROM issue_labels il WHERE il.issue_id=i.id AND il.label_id=:label)"
            )
            params["label"] = payload.labelId
        if payload.query:
            filters.append(
                "(i.title ILIKE :query ESCAPE '\\' OR i.identifier ILIKE :query ESCAPE '\\' OR i.description ILIKE :query ESCAPE '\\')"
            )
            params["query"] = literal_search(payload.query)
        for field, operator in [("updatedAfter", ">="), ("updatedBefore", "<=")]:
            value = getattr(payload, field)
            if value:
                filters.append(f"i.updated_at {operator} :{field}")
                params[field] = (
                    value.astimezone(timezone.utc).replace(tzinfo=None)
                    if value.tzinfo
                    else value
                )
        if payload.overdue:
            filters.append(
                "i.due_date<:now AND s.category NOT IN ('COMPLETED','CANCELED')"
            )
            params["now"] = _utcnow()
        suffix = " AND " + " AND ".join(filters) if filters else ""
        return await self.page(
            "search_issues",
            payload,
            f"""SELECT i.id,i.identifier,i.title,i.priority,i.issue_type AS "issueType",i.severity,
            i.project_id AS "projectId",i.team_id AS "teamId",i.assignee_id AS "assigneeId",
            i.status_id AS "statusId",s.name AS "statusName",s.category,i.version,
            i.due_date AS "dueDate",i.updated_at AS "updatedAt"
            FROM issues i JOIN issue_statuses s ON s.id=i.status_id WHERE {self.policy.issue_clause()}{suffix}""",
            params,
        )

    async def comments(self, payload) -> dict:
        issue = await self.policy.issue(payload.issueId)
        return await self.page(
            "list_comments",
            payload,
            """SELECT c.id,c.issue_id AS "issueId",c.author_id AS "authorId",
            c.content,c.version,c.parent_comment_id AS "parentCommentId",c.mention_ids AS "mentionIds",c.created_at AS "createdAt",c.updated_at AS "updatedAt"
            FROM comments c WHERE c.issue_id=:issue AND c.deleted_at IS NULL""",
            {"issue": issue["id"]},
            time_field="createdAt",
        )

    async def documents(self, payload) -> dict:
        filters, params = [], {}
        if payload.projectId:
            await self.policy.project(payload.projectId)
            filters.append(
                "EXISTS(SELECT 1 FROM document_links dl LEFT JOIN issues li ON li.id=dl.issue_id WHERE dl.document_id=d.id AND COALESCE(dl.project_id,li.project_id)=:project)"
            )
            params["project"] = payload.projectId
        if payload.issueId:
            issue = await self.policy.issue(payload.issueId)
            filters.append(
                "EXISTS(SELECT 1 FROM document_links dl WHERE dl.document_id=d.id AND dl.issue_id=:issue)"
            )
            params["issue"] = issue["id"]
        if payload.teamId:
            await self.policy.team(payload.teamId)
            filters.append("d.team_id=:team")
            params["team"] = payload.teamId
        if payload.query:
            filters.append(
                "(d.title ILIKE :query ESCAPE '\\' OR d.content ILIKE :query ESCAPE '\\')"
            )
            params["query"] = literal_search(payload.query)
        suffix = " AND " + " AND ".join(filters) if filters else ""
        return await self.page(
            "search_documents",
            payload,
            f"""SELECT d.id,d.title,d.team_id AS "teamId",
            d.folder_id AS "folderId",d.version,left(d.content,400) AS excerpt,d.updated_at AS "updatedAt"
            FROM documents d WHERE {self.policy.document_clause()}{suffix}""",
            params,
        )

    async def activities(self, payload) -> dict:
        issue = await self.policy.issue(payload.issueId)
        # Activity payloads can contain names of formerly linked objects; return a scoped envelope only.
        return await self.page(
            "list_activities",
            payload,
            """SELECT a.id,a.type,a.actor_id AS "actorId",
            a.issue_id AS "issueId",a.created_at AS "createdAt" FROM activities a
            WHERE a.workspace_id=:workspace AND a.issue_id=:issue""",
            {"issue": issue["id"]},
            time_field="createdAt",
        )

    async def reviews(self, payload) -> dict:
        issue = await self.policy.issue(payload.issueId)
        return await self.page(
            "list_issue_reviews",
            payload,
            f"""SELECT r.id,r.title,r.state,r.remote_url AS url,
            r.updated_at AS "updatedAt" FROM code_reviews r
            JOIN code_review_issue_links l ON l.code_review_id=r.id JOIN scm_repositories repo ON repo.id=r.repository_id
            WHERE l.issue_id=:issue AND r.workspace_id=:workspace AND repo.enabled=true
            AND repo.team_id=:team AND {self.policy.team_clause("repo.team_id")}""",
            {"issue": issue["id"], "team": issue["team_id"]},
        )

    async def project(self, payload) -> dict:
        row = await self.policy.project(payload.projectId)
        return {
            key: row[key]
            for key in (
                "id",
                "name",
                "identifier",
                "description",
                "status",
                "team_id",
                "start_date",
                "target_date",
                "updated_at",
            )
        }

    async def issue(self, payload) -> dict:
        row = await self.policy.issue(payload.issueId)
        from ..work_items.issue_queries import _issue_row

        result = await _issue_row(
            self.db, row["id"], self.principal.workspace_id, self.principal.user["id"]
        )
        # Related identifiers are resolved independently by get_issue_context.
        result.pop("parentIssueId", None)
        result.pop("duplicateOfId", None)
        return result

    async def document(self, payload) -> dict:
        row = await self.policy.document(payload.documentId)
        end = payload.offset + payload.limit
        return {
            "id": row["id"],
            "title": row["title"],
            "content": row["content"][payload.offset : end],
            "nextOffset": end if end < len(row["content"]) else None,
            "truncated": end < len(row["content"]),
            "version": row["version"],
            "teamId": row["team_id"],
            "folderId": row["folder_id"],
            "docType": row["doc_type"],
            "status": row["status"],
            "updatedAt": row["updated_at"],
        }

    async def feature_docs(self, payload) -> dict:
        from .feature_docs import read_feature_docs

        return await read_feature_docs(self.db, self.policy, payload.issueId)

    async def revisions(self, payload) -> dict:
        from ..work_items.document_history import list_revisions
        await self.policy.document(payload.documentId)
        return await list_revisions(self.db, payload.documentId)

    async def revision_row(self, document_id: str, version: int) -> dict:
        from ..work_items.document_history import revision_row
        return await revision_row(self.db, document_id, version)

    async def revision(self, payload) -> dict:
        await self.policy.document(payload.documentId)
        row = await self.revision_row(payload.documentId, payload.revisionVersion)
        end = payload.offset + payload.limit
        return {
            "documentId": payload.documentId,
            "version": row["version"],
            "title": row["title"],
            "content": row["content"][payload.offset : end],
            "nextOffset": end if end < len(row["content"]) else None,
        }

    async def diff(self, payload) -> dict:
        from ..work_items.document_history import revision_diff
        current = await self.policy.document(payload.documentId)
        before = await self.revision_row(payload.documentId, payload.fromVersion)
        after = await self.revision_row(payload.documentId, payload.toVersion) if payload.toVersion else current
        return await revision_diff(before, after, payload.maxLines)

    async def options(self, payload) -> dict:
        await self.policy.team(payload.teamId)
        params = {**self.policy.params, "team": payload.teamId}
        statuses = (
            await self.db.execute(
                text("""SELECT id,name,category FROM issue_statuses
            WHERE workspace_id=:workspace AND (team_id IS NULL OR team_id=:team) ORDER BY position,id LIMIT 100"""),
                params,
            )
        ).mappings()
        labels = (
            await self.db.execute(
                text("""SELECT id,name FROM labels WHERE workspace_id=:workspace
            ORDER BY name,id LIMIT 100"""),
                params,
            )
        ).mappings()
        members = (
            await self.db.execute(
                text("""SELECT u.id,u.name FROM users u JOIN team_members tm ON tm.user_id=u.id
            JOIN workspace_members wm ON wm.user_id=u.id AND wm.workspace_id=:workspace
            WHERE tm.team_id=:team AND u.status='ACTIVE' AND wm.status='ACTIVE' ORDER BY u.name,u.id LIMIT 100"""),
                params,
            )
        ).mappings()
        return {
            "statuses": [dict(r) for r in statuses],
            "labels": [dict(r) for r in labels],
            "members": [dict(r) for r in members],
            "limitPerSection": 100,
        }

    async def context(self, payload) -> dict:
        from .contracts import IssuePageInput, SearchDocumentsInput

        issue = await self.policy.issue(payload.issueId)
        params = IssuePageInput(issueId=issue["id"], limit=payload.limit)
        comments = (
            await self.comments(params)
            if "comments:read" in self.principal.scopes
            else {"unavailable": True}
        )
        for comment in comments.get("items", []):
            if len(comment["content"]) > 2000:
                comment["content"] = comment["content"][:2000]
                comment["contentTruncated"] = True
        attachments = list(
            (
                await self.db.execute(
                    text("""SELECT id,filename,mime_type AS "mimeType",size FROM attachments
            WHERE workspace_id=:workspace AND entity_type='issue' AND entity_id=:issue ORDER BY created_at,id LIMIT :limit"""),
                    {
                        **self.policy.params,
                        "issue": issue["id"],
                        "limit": payload.limit + 1,
                    },
                )
            ).mappings()
        )
        children = list(
            (
                await self.db.execute(
                    text(f"""SELECT child.id,child.identifier,child.title FROM issues child
            WHERE child.parent_issue_id=:issue AND {self.policy.issue_clause("child")} ORDER BY child.id LIMIT :limit"""),
                    {
                        **self.policy.params,
                        "issue": issue["id"],
                        "limit": payload.limit + 1,
                    },
                )
            ).mappings()
        )
        relations = (
            await self.db.execute(
                text(f"""SELECT other.id,other.identifier,other.title,r.type
            FROM issue_relations r JOIN issues other ON other.id=CASE WHEN r.issue_id=:id THEN r.related_issue_id ELSE r.issue_id END
            WHERE r.workspace_id=:workspace AND (r.issue_id=:id OR r.related_issue_id=:id)
            AND {self.policy.issue_clause("other")} ORDER BY other.id LIMIT 26"""),
                {**self.policy.params, "id": issue["id"]},
            )
        ).mappings()
        related = [dict(row) for row in relations]
        return {
            "issue": await self.issue(payload),
            "projectDocuments": await self.documents(
                SearchDocumentsInput(projectId=issue["project_id"], limit=25)
            )
            if issue["project_id"] and "documents:read" in self.principal.scopes
            else {"unavailable": True},
            "comments": comments,
            "attachments": {
                "items": [dict(row) for row in attachments[: payload.limit]],
                "truncated": len(attachments) > payload.limit,
            },
            "subIssues": {
                "items": [dict(row) for row in children[: payload.limit]],
                "truncated": len(children) > payload.limit,
            },
            "documents": await self.documents(
                SearchDocumentsInput(issueId=issue["id"], limit=25)
            )
            if "documents:read" in self.principal.scopes
            else {"unavailable": True},
            "reviews": await self.reviews(params)
            if "reviews:read" in self.principal.scopes
            else {"unavailable": True},
            "relations": {"items": related[:25], "truncated": len(related) > 25},
        }
