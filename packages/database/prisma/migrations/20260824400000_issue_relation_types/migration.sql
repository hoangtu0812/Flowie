-- CreateEnum
CREATE TYPE "IssueRelationType" AS ENUM ('RELATED', 'BLOCKS');

-- AlterTable: the default also backfills every existing symmetric link as RELATED.
ALTER TABLE "issue_relations"
ADD COLUMN "type" "IssueRelationType" NOT NULL DEFAULT 'RELATED';
