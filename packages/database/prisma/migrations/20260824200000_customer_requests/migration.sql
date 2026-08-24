CREATE TABLE "customer_requests" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "customer" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'none',
    "project_id" TEXT,
    "issue_id" TEXT,
    "created_by" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "customer_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "customer_requests_workspace_id_archived_at_status_idx"
ON "customer_requests"("workspace_id", "archived_at", "status");

CREATE INDEX "customer_requests_project_id_idx"
ON "customer_requests"("project_id");

CREATE INDEX "customer_requests_issue_id_idx"
ON "customer_requests"("issue_id");

ALTER TABLE "customer_requests"
ADD CONSTRAINT "customer_requests_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_requests"
ADD CONSTRAINT "customer_requests_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_requests"
ADD CONSTRAINT "customer_requests_issue_id_fkey"
FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "customer_requests"
ADD CONSTRAINT "customer_requests_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
