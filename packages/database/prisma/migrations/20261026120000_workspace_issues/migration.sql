ALTER TABLE "workspaces" ADD COLUMN "issue_sequence" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "issues" ALTER COLUMN "team_id" DROP NOT NULL;
ALTER TABLE "issue_lifecycle_events" ALTER COLUMN "to_team_id" DROP NOT NULL;
