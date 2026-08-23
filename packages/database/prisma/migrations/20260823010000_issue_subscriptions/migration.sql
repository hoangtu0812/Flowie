CREATE TABLE "issue_subscriptions" (
    "issue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_subscriptions_pkey" PRIMARY KEY ("issue_id", "user_id")
);

CREATE INDEX "issue_subscriptions_user_id_created_at_idx"
ON "issue_subscriptions"("user_id", "created_at");

ALTER TABLE "issue_subscriptions"
ADD CONSTRAINT "issue_subscriptions_issue_id_fkey"
FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_subscriptions"
ADD CONSTRAINT "issue_subscriptions_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
