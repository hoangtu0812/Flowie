ALTER TABLE "users" ADD COLUMN "last_seen_at" TIMESTAMP(3);

UPDATE "users"
SET "last_seen_at" = COALESCE("last_login_at", "updated_at", "created_at")
WHERE "last_seen_at" IS NULL;

CREATE INDEX "users_last_seen_at_idx" ON "users"("last_seen_at");
