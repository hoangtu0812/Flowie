CREATE TABLE "issue_templates" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "title" TEXT NOT NULL,
    "issue_description" TEXT,
    "status_id" TEXT,
    "priority" "IssuePriority" NOT NULL DEFAULT 'NONE',
    "project_id" TEXT,
    "assignee_id" TEXT,
    "label_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "issue_templates_workspace_id_name_key"
ON "issue_templates"("workspace_id", "name");

CREATE INDEX "issue_templates_workspace_id_idx"
ON "issue_templates"("workspace_id");

ALTER TABLE "issue_templates"
ADD CONSTRAINT "issue_templates_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_templates"
ADD CONSTRAINT "issue_templates_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
