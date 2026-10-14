CREATE TABLE "mcp_connections" (
    "id" TEXT PRIMARY KEY,
    "workspace_id" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL UNIQUE,
    "scopes" TEXT[] NOT NULL,
    "team_ids" TEXT[] NOT NULL DEFAULT '{}',
    "project_ids" TEXT[] NOT NULL DEFAULT '{}',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "rate_window" TIMESTAMP(3),
    "rate_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE INDEX "mcp_connections_workspace_id_user_id_idx" ON "mcp_connections"("workspace_id", "user_id");

CREATE TABLE "mcp_requests" (
    "connection_id" TEXT NOT NULL REFERENCES "mcp_connections"("id") ON DELETE CASCADE,
    "tool" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    PRIMARY KEY ("connection_id", "tool", "key")
);
CREATE INDEX "mcp_requests_created_at_idx" ON "mcp_requests"("created_at");

ALTER TABLE "issues" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "comments" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "documents" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- Database triggers cover legacy writers as well as MCP mutations.
CREATE FUNCTION flowie_increment_version() RETURNS TRIGGER AS $$
BEGIN
    NEW.version := OLD.version + 1;
    NEW.updated_at := CURRENT_TIMESTAMP AT TIME ZONE 'UTC';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER issue_version BEFORE UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION flowie_increment_version();
CREATE TRIGGER comment_version BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION flowie_increment_version();
CREATE TRIGGER document_version BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION flowie_increment_version();

CREATE TABLE "document_revisions" (
    "id" TEXT PRIMARY KEY,
    "document_id" TEXT NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    UNIQUE ("document_id", "version")
);
INSERT INTO document_revisions (id, document_id, version, title, content, actor_id)
SELECT id || ':1', id, version, title, content, updated_by FROM documents;
CREATE FUNCTION flowie_document_revision() RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.title IS DISTINCT FROM OLD.title OR NEW.content IS DISTINCT FROM OLD.content THEN
        INSERT INTO document_revisions (id, document_id, version, title, content, actor_id)
        VALUES (NEW.id || ':' || NEW.version, NEW.id, NEW.version, NEW.title, NEW.content, NEW.updated_by);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER document_revision AFTER INSERT OR UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION flowie_document_revision();

CREATE TABLE "document_links" (
    "id" TEXT PRIMARY KEY,
    "document_id" TEXT NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
    "workspace_id" TEXT NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
    "project_id" TEXT REFERENCES "projects"("id") ON DELETE CASCADE,
    "issue_id" TEXT REFERENCES "issues"("id") ON DELETE CASCADE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT "document_link_one_target" CHECK ((project_id IS NULL) <> (issue_id IS NULL))
);
CREATE UNIQUE INDEX "document_links_document_id_project_id_key" ON document_links(document_id, project_id);
CREATE UNIQUE INDEX "document_links_document_id_issue_id_key" ON document_links(document_id, issue_id);
CREATE INDEX "document_links_workspace_id_project_id_idx" ON document_links(workspace_id, project_id);
CREATE INDEX "document_links_workspace_id_issue_id_idx" ON document_links(workspace_id, issue_id);

CREATE TABLE "notification_outbox" (
    "id" TEXT PRIMARY KEY,
    "workspace_id" TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    "lease_until" TIMESTAMP(3),
    "lease_token" TEXT,
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE INDEX "notification_outbox_available_at_idx" ON notification_outbox(available_at) WHERE delivered_at IS NULL AND failed_at IS NULL;
