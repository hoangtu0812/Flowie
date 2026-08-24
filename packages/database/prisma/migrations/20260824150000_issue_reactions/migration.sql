CREATE TABLE "issue_reactions" (
    "issue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_reactions_pkey" PRIMARY KEY ("issue_id", "user_id", "emoji")
);

CREATE INDEX "issue_reactions_issue_id_created_at_idx"
ON "issue_reactions"("issue_id", "created_at");

ALTER TABLE "issue_reactions"
ADD CONSTRAINT "issue_reactions_issue_id_fkey"
FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_reactions"
ADD CONSTRAINT "issue_reactions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
