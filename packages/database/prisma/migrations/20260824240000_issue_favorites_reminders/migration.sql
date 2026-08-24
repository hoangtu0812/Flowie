CREATE TABLE "issue_favorites" (
    "issue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_favorites_pkey" PRIMARY KEY ("issue_id", "user_id")
);

CREATE TABLE "issue_reminders" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "remind_at" TIMESTAMP(3) NOT NULL,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "issue_reminders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "issue_favorites_user_id_created_at_idx" ON "issue_favorites"("user_id", "created_at");
CREATE UNIQUE INDEX "issue_reminders_issue_id_user_id_key" ON "issue_reminders"("issue_id", "user_id");
CREATE INDEX "issue_reminders_user_id_delivered_at_remind_at_idx" ON "issue_reminders"("user_id", "delivered_at", "remind_at");

ALTER TABLE "issue_favorites"
ADD CONSTRAINT "issue_favorites_issue_id_fkey"
FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_favorites"
ADD CONSTRAINT "issue_favorites_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_reminders"
ADD CONSTRAINT "issue_reminders_issue_id_fkey"
FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "issue_reminders"
ADD CONSTRAINT "issue_reminders_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
