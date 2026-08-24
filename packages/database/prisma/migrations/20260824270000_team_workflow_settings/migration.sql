ALTER TABLE "teams"
ADD COLUMN "triage_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "cycle_cadence_weeks" INTEGER,
ADD COLUMN "auto_close_days" INTEGER,
ADD COLUMN "auto_archive_days" INTEGER,
ADD COLUMN "parent_team_id" TEXT,
ADD COLUMN "default_issue_template_id" TEXT;

CREATE INDEX "teams_parent_team_id_idx" ON "teams"("parent_team_id");
CREATE INDEX "teams_default_issue_template_id_idx" ON "teams"("default_issue_template_id");

ALTER TABLE "teams"
ADD CONSTRAINT "teams_parent_team_id_fkey"
FOREIGN KEY ("parent_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "teams"
ADD CONSTRAINT "teams_default_issue_template_id_fkey"
FOREIGN KEY ("default_issue_template_id") REFERENCES "issue_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
