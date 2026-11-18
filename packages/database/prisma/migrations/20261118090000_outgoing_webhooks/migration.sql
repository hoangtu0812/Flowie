-- Workspace outgoing webhooks and their delivery log (DTD-904). Additive only: no existing
-- table or row changes.
-- VI: Webhook gửi ra ngoài của workspace và nhật ký gửi (DTD-904). Chỉ thêm mới: không đổi
-- VI: bảng hay dòng dữ liệu hiện có.
-- CreateTable
CREATE TABLE "outgoing_webhooks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "disabled_at" TIMESTAMP(3),
    "disabled_reason" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "outgoing_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outgoing_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhook_id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lease_until" TIMESTAMP(3),
    "lease_token" TEXT,
    "response_status" INTEGER,
    "duration_ms" INTEGER,
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outgoing_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outgoing_webhooks_workspace_id_idx" ON "outgoing_webhooks"("workspace_id");

-- CreateIndex
CREATE INDEX "outgoing_webhook_deliveries_webhook_id_created_at_idx" ON "outgoing_webhook_deliveries"("webhook_id", "created_at");

-- CreateIndex
CREATE INDEX "outgoing_webhook_deliveries_available_at_idx" ON "outgoing_webhook_deliveries"("available_at");

-- AddForeignKey
ALTER TABLE "outgoing_webhooks" ADD CONSTRAINT "outgoing_webhooks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_webhooks" ADD CONSTRAINT "outgoing_webhooks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "outgoing_webhook_deliveries" ADD CONSTRAINT "outgoing_webhook_deliveries_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "outgoing_webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

