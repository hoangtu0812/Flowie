CREATE TABLE "teams_webhooks" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "webhook_url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "teams_webhooks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "teams_webhooks_workspace_id_key" ON "teams_webhooks"("workspace_id");
ALTER TABLE "teams_webhooks" ADD CONSTRAINT "teams_webhooks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "project_teams_channels" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "channel_name" TEXT,
    "webhook_url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_teams_channels_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_teams_channels_project_id_key" ON "project_teams_channels"("project_id");
ALTER TABLE "project_teams_channels" ADD CONSTRAINT "project_teams_channels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
