CREATE TABLE "asks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "project_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "IssuePriority" NOT NULL DEFAULT 'NONE',
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_by" TEXT NOT NULL,
    "converted_issue_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "asks_workspace_id_archived_at_status_idx"
ON "asks"("workspace_id", "archived_at", "status");

CREATE INDEX "asks_team_id_idx" ON "asks"("team_id");
CREATE INDEX "asks_project_id_idx" ON "asks"("project_id");
CREATE INDEX "asks_converted_issue_id_idx" ON "asks"("converted_issue_id");

ALTER TABLE "asks"
ADD CONSTRAINT "asks_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asks"
ADD CONSTRAINT "asks_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asks"
ADD CONSTRAINT "asks_project_id_fkey"
FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "asks"
ADD CONSTRAINT "asks_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "asks"
ADD CONSTRAINT "asks_converted_issue_id_fkey"
FOREIGN KEY ("converted_issue_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
