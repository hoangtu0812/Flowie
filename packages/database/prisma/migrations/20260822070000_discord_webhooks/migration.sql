CREATE TABLE "discord_webhooks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "webhook_url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "discord_webhooks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "discord_webhooks_workspace_id_key" ON "discord_webhooks"("workspace_id");
ALTER TABLE "discord_webhooks" ADD CONSTRAINT "discord_webhooks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
