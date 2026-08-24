CREATE TABLE "notification_preferences" (
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "team_issue_added" BOOLEAN NOT NULL DEFAULT false,
    "issue_completed" BOOLEAN NOT NULL DEFAULT false,
    "issue_added_to_triage" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("workspace_id", "user_id")
);

CREATE INDEX "notification_preferences_user_id_idx"
ON "notification_preferences"("user_id");

ALTER TABLE "notification_preferences"
ADD CONSTRAINT "notification_preferences_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notification_preferences"
ADD CONSTRAINT "notification_preferences_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
