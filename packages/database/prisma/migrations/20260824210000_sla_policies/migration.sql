CREATE TABLE "sla_policies" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "team_id" TEXT,
    "priority" "IssuePriority",
    "deadline_minutes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sla_policies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sla_policies_workspace_id_archived_at_enabled_idx"
ON "sla_policies"("workspace_id", "archived_at", "enabled");

CREATE INDEX "sla_policies_team_id_idx"
ON "sla_policies"("team_id");

ALTER TABLE "sla_policies"
ADD CONSTRAINT "sla_policies_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sla_policies"
ADD CONSTRAINT "sla_policies_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sla_policies"
ADD CONSTRAINT "sla_policies_created_by_fkey"
FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
