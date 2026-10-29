from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel

from . import contracts as c
from ..agent_runs import contracts as r


@dataclass(frozen=True, slots=True)
class ToolDefinition:
    name: str
    description: str
    model: type[BaseModel]
    scope: str
    handler: str
    write: bool = False
    extra_scopes: tuple[str, ...] = ()


DEFINITIONS = (
    ToolDefinition(
        "get_document_revision",
        "Read a bounded text page from an authorized historical document revision.",
        c.DocumentRevisionInput,
        "documents:read",
        "revision",
    ),
    ToolDefinition(
        "get_feature_docs",
        "Read the FDS/TDS linked to an issue (with content), the module/feature folders of its project with their FDS/TDS, and a warning when the issue has no FDS/TDS yet.",
        c.IssueInput,
        "documents:read",
        "feature_docs",
        extra_scopes=("issues:read",),
    ),
    ToolDefinition(
        "get_document_diff",
        "Compare an authorized historical document revision with another revision or the current document.",
        c.DocumentDiffInput,
        "documents:read",
        "diff",
    ),
    ToolDefinition(
        "get_bug_template",
        "Read standardized bug-report sections before creating a bug issue.",
        c.EmptyInput,
        "issues:read",
        "bug_template",
    ),
    ToolDefinition(
        "read_attachment_text",
        "Read a bounded page of UTF-8 text from an independently authorized attachment; binary documents are not decoded.",
        c.AttachmentInput,
        "issues:read",
        "attachment",
    ),
    ToolDefinition(
        "read_attachment_image",
        "Read an authorized PNG, JPEG, GIF or WebP attachment of at most 5 MiB as an image, such as a screenshot in a task description or comment. Take the id from attachment lists or from /attachments/<id>/preview links in descriptions and comments.",
        c.ImageAttachmentInput,
        "issues:read",
        "attachment_image",
    ),
    ToolDefinition(
        "get_run",
        "Read an authorized agent run; lease secrets are visible only to its owning connection.",
        r.RunInput,
        "runs:read",
        "run_get",
        extra_scopes=("issues:read",),
    ),
    ToolDefinition(
        "list_runs",
        "List pending and completed agent runs in the project scope.",
        r.RunPageInput,
        "runs:read",
        "run_list",
        extra_scopes=("issues:read",),
    ),
    ToolDefinition(
        "get_project_repositories",
        "Read trusted project repository configuration for an external coding agent.",
        c.ProjectInput,
        "projects:read",
        "run_repositories",
    ),
    ToolDefinition(
        "claim_issue",
        "Claim an issue for five minutes; heartbeat and fencing prevent concurrent ownership.",
        r.ClaimInput,
        "runs:write",
        "claim_issue",
        True,
        ("issues:read",),
    ),
    ToolDefinition(
        "heartbeat_run",
        "Renew an owned live run lease and optionally report one line of current progress; use a new key for each heartbeat.",
        r.HeartbeatInput,
        "runs:write",
        "heartbeat_run",
        True,
        ("issues:read",),
    ),
    ToolDefinition(
        "release_issue",
        "Release an owned live run without marking the issue complete.",
        r.LeaseInput,
        "runs:write",
        "release_issue",
        True,
        ("issues:read",),
    ),
    ToolDefinition(
        "cancel_run",
        "Cancel an active run owned by this connection.",
        r.CancelInput,
        "runs:write",
        "cancel_run",
        True,
        ("issues:read",),
    ),
    ToolDefinition(
        "report_run_result",
        "Record agent-reported commit, PR and test evidence; successful code results await review.",
        r.ResultInput,
        "runs:write",
        "report_run_result",
        True,
        ("issues:read", "comments:write"),
    ),
    ToolDefinition(
        "get_my_access",
        "Inspect this connection and its effective access limits.",
        c.EmptyInput,
        "context:read",
        "access",
    ),
    ToolDefinition(
        "list_workspaces",
        "Read the workspace authorized for this connection.",
        c.EmptyInput,
        "context:read",
        "workspaces",
    ),
    ToolDefinition(
        "list_teams",
        "List accessible teams with cursor pagination.",
        c.PageInput,
        "context:read",
        "teams",
    ),
    ToolDefinition(
        "list_projects",
        "List accessible projects with cursor pagination.",
        c.PageInput,
        "projects:read",
        "projects",
    ),
    ToolDefinition(
        "get_project",
        "Read a project in the authorized scope.",
        c.ProjectInput,
        "projects:read",
        "project",
    ),
    ToolDefinition(
        "search_issues",
        "Search tasks and bugs by project, label, state, assignee and dates.",
        c.SearchIssuesInput,
        "issues:read",
        "issues",
    ),
    ToolDefinition(
        "get_issue",
        "Read an issue by ID or workspace issue identifier.",
        c.IssueInput,
        "issues:read",
        "issue",
    ),
    ToolDefinition(
        "list_issue_options",
        "Read valid team statuses, labels and assignees before writing.",
        c.IssueOptionsInput,
        "issues:read",
        "options",
    ),
    ToolDefinition(
        "get_issue_context",
        "Read an issue with independently authorized comments, documents, reviews and relations.",
        c.IssueContextInput,
        "issues:read",
        "context",
    ),
    ToolDefinition(
        "list_comments",
        "Read issue comments with pagination.",
        c.IssuePageInput,
        "comments:read",
        "comments",
    ),
    ToolDefinition(
        "search_documents",
        "Search documents linked to an accessible project or issue.",
        c.SearchDocumentsInput,
        "documents:read",
        "documents",
    ),
    ToolDefinition(
        "get_document",
        "Read document content and current version.",
        c.DocumentReadInput,
        "documents:read",
        "document",
    ),
    ToolDefinition(
        "list_document_revisions",
        "Read the latest 100 document revision summaries.",
        c.DocumentInput,
        "documents:read",
        "revisions",
    ),
    ToolDefinition(
        "list_activities",
        "Read authorized issue activity envelopes.",
        c.IssuePageInput,
        "activities:read",
        "activities",
    ),
    ToolDefinition(
        "list_issue_reviews",
        "Read linked source-control reviews without writing to the provider.",
        c.IssuePageInput,
        "reviews:read",
        "reviews",
    ),
    ToolDefinition(
        "create_issue",
        "Create an issue using valid team references; retries require the same idempotency key.",
        c.CreateIssueTool,
        "issues:write",
        "create_issue",
        True,
        extra_scopes=("issues:read",),
    ),
    ToolDefinition(
        "update_issue",
        "Update issue fields with expectedVersion; use transition_issue for status changes.",
        c.UpdateIssueTool,
        "issues:write",
        "update_issue",
        True,
        extra_scopes=("issues:read",),
    ),
    ToolDefinition(
        "transition_issue",
        "Change a valid team status and record a reason comment atomically.",
        c.TransitionIssueTool,
        "issues:transition",
        "transition_issue",
        True,
        ("issues:read", "comments:write"),
    ),
    ToolDefinition(
        "add_comment",
        "Add a comment to an authorized issue with retry deduplication.",
        c.AddCommentTool,
        "comments:write",
        "add_comment",
        True,
        extra_scopes=("issues:read", "comments:read"),
    ),
    ToolDefinition(
        "update_comment",
        "Update a comment owned by the author with version precondition.",
        c.UpdateCommentTool,
        "comments:write",
        "update_comment",
        True,
        extra_scopes=("issues:read", "comments:read"),
    ),
    ToolDefinition(
        "create_document",
        "Create a Markdown document, optionally linked to a project or issue.",
        c.CreateDocumentTool,
        "documents:write",
        "create_document",
        True,
        extra_scopes=("documents:read",),
    ),
    ToolDefinition(
        "update_document",
        "Replace document title/content with version precondition and revision history.",
        c.UpdateDocumentTool,
        "documents:write",
        "update_document",
        True,
        extra_scopes=("documents:read",),
    ),
    ToolDefinition(
        "upsert_feature_doc",
        "Create or update the FDS or TDS of a module/feature in the issue's project document tree (missing folders are created), add a change-log row for the issue and link the document to it. Call get_feature_docs first and send the full updated content.",
        c.UpsertFeatureDocTool,
        "documents:write",
        "upsert_feature_doc",
        True,
        extra_scopes=("documents:read", "issues:read"),
    ),
    ToolDefinition(
        "link_document",
        "Link a document to an authorized project or issue.",
        c.LinkDocumentTool,
        "documents:write",
        "link_document",
        True,
        extra_scopes=("documents:read",),
    ),
    ToolDefinition(
        "restore_document",
        "Restore historical content as a new revision without deleting history.",
        c.RestoreDocumentTool,
        "documents:write",
        "restore_document",
        True,
        extra_scopes=("documents:read",),
    ),
)
TOOLS = {definition.name: definition for definition in DEFINITIONS}


def visible_tools(principal, writes_enabled: bool) -> list[ToolDefinition]:
    return [
        tool
        for tool in DEFINITIONS
        if {tool.scope, *tool.extra_scopes}.issubset(principal.scopes)
        and (writes_enabled or not tool.write)
    ]
