ALTER TABLE "scm_webhook_deliveries"
ADD COLUMN "payload" JSONB NOT NULL,
ADD COLUMN "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP INDEX "scm_webhook_deliveries_status_received_at_idx";
CREATE INDEX "scm_webhook_deliveries_status_next_attempt_at_received_at_idx"
ON "scm_webhook_deliveries"("status", "next_attempt_at", "received_at");
