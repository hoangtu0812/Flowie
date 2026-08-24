CREATE TYPE "IssueResolution" AS ENUM ('DUPLICATE', 'WONT_FIX');

ALTER TABLE "issues"
ADD COLUMN "resolution" "IssueResolution",
ADD COLUMN "duplicate_of_id" TEXT;

CREATE INDEX "issues_duplicate_of_id_idx" ON "issues"("duplicate_of_id");

ALTER TABLE "issues"
ADD CONSTRAINT "issues_duplicate_of_id_fkey"
FOREIGN KEY ("duplicate_of_id") REFERENCES "issues"("id") ON DELETE SET NULL ON UPDATE CASCADE;
