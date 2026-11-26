-- Workspace API keys for other systems (the news feed), separate from MCP connections.
-- VI: API key của workspace cho hệ thống khác (news feed), tách khỏi kết nối MCP.
-- CreateTable
CREATE TABLE "workspace_api_keys" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "rate_window" TIMESTAMP(3),
    "rate_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'::text),

    CONSTRAINT "workspace_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workspace_api_keys_token_hash_key" ON "workspace_api_keys"("token_hash");

-- CreateIndex
CREATE INDEX "workspace_api_keys_workspace_id_idx" ON "workspace_api_keys"("workspace_id");

-- AddForeignKey
ALTER TABLE "workspace_api_keys" ADD CONSTRAINT "workspace_api_keys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "workspace_api_keys" ADD CONSTRAINT "workspace_api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

