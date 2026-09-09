ALTER TABLE "discord_webhooks"
ADD COLUMN "daily_digest_enabled" BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN "daily_digest_sent_at" TIMESTAMP(3);
