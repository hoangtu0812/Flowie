CREATE TYPE "TeamJoinPolicy" AS ENUM ('OPEN', 'INVITE_ONLY');

ALTER TABLE "teams"
ADD COLUMN "join_policy" "TeamJoinPolicy" NOT NULL DEFAULT 'OPEN';
