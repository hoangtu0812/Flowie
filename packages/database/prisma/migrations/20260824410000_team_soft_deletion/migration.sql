ALTER TABLE "teams" ADD COLUMN "deleted_at" TIMESTAMP(3);

CREATE INDEX "teams_workspace_id_deleted_at_idx" ON "teams"("workspace_id", "deleted_at");
