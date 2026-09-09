CREATE TABLE "team_dispatcher_settings" (
    "team_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT FALSE,
    "dry_run" BOOLEAN NOT NULL DEFAULT TRUE,
    "max_actions_per_day" INTEGER NOT NULL DEFAULT 5,
    "assign_unassigned" BOOLEAN NOT NULL DEFAULT TRUE,
    "nudge_overdue" BOOLEAN NOT NULL DEFAULT TRUE,
    "last_run_at" TIMESTAMP(3),
    "last_run_result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "team_dispatcher_settings_pkey" PRIMARY KEY ("team_id")
);

ALTER TABLE "team_dispatcher_settings"
ADD CONSTRAINT "team_dispatcher_settings_team_id_fkey"
FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
