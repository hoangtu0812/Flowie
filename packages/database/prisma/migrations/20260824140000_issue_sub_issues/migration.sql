ALTER TABLE "issues" ADD COLUMN "parent_issue_id" TEXT;

CREATE INDEX "issues_parent_issue_id_idx" ON "issues"("parent_issue_id");

ALTER TABLE "issues"
ADD CONSTRAINT "issues_parent_issue_id_fkey"
FOREIGN KEY ("parent_issue_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "issues"
ADD CONSTRAINT "issues_parent_issue_not_self"
CHECK ("parent_issue_id" IS NULL OR "parent_issue_id" <> "id");
