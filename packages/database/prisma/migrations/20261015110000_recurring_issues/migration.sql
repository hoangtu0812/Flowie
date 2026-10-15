CREATE TABLE "recurring_schedules" (
    "id" TEXT NOT NULL,"workspace_id" TEXT NOT NULL,"team_id" TEXT NOT NULL,"created_by" TEXT NOT NULL,
    "request_key" TEXT NOT NULL,"fingerprint" TEXT NOT NULL,"name" TEXT NOT NULL,
    "rule" JSONB NOT NULL,"template" JSONB NOT NULL,"due_after_minutes" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,"version" INTEGER NOT NULL DEFAULT 1,
    "next_run_at" TIMESTAMP(3) NOT NULL,"consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "recurring_schedules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurring_schedules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recurring_schedules_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recurring_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "recurring_schedules_created_by_request_key_key" ON "recurring_schedules"("created_by","request_key");
CREATE INDEX "recurring_schedules_active_next_run_at_idx" ON "recurring_schedules"("active","next_run_at");
CREATE INDEX "recurring_schedules_workspace_id_team_id_created_at_idx" ON "recurring_schedules"("workspace_id","team_id","created_at");
CREATE TABLE "recurring_runs" (
    "id" TEXT NOT NULL,"schedule_id" TEXT NOT NULL,"occurrence_key" TEXT NOT NULL,
    "scheduled_for" TIMESTAMP(3) NOT NULL,"state" TEXT NOT NULL,"snapshot" JSONB NOT NULL,
    "issue_id" TEXT,"error_code" TEXT,"created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "recurring_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "recurring_runs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "recurring_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "recurring_runs_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "recurring_runs_schedule_id_occurrence_key_key" ON "recurring_runs"("schedule_id","occurrence_key");
CREATE INDEX "recurring_runs_schedule_id_created_at_id_idx" ON "recurring_runs"("schedule_id","created_at","id");
