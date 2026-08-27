CREATE TYPE "AgentProvider" AS ENUM ('OPENAI', 'GOOGLE');
CREATE TYPE "AgentMessageRole" AS ENUM ('USER', 'ASSISTANT');

CREATE TABLE "workspace_agent_providers" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "provider" "AgentProvider" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "api_key_encrypted" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_agent_providers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_conversations" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agent_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "AgentMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "proposal" JSONB,
    "accepted_at" TIMESTAMP(3),
    "applied_at" TIMESTAMP(3),
    "applied_result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_agent_providers_workspace_id_provider_key"
ON "workspace_agent_providers"("workspace_id", "provider");
CREATE INDEX "workspace_agent_providers_workspace_id_enabled_idx"
ON "workspace_agent_providers"("workspace_id", "enabled");
CREATE UNIQUE INDEX "workspace_agent_providers_one_enabled_key"
ON "workspace_agent_providers"("workspace_id") WHERE "enabled" = true;
CREATE INDEX "agent_conversations_workspace_id_user_id_updated_at_idx"
ON "agent_conversations"("workspace_id", "user_id", "updated_at");
CREATE INDEX "agent_messages_conversation_id_created_at_idx"
ON "agent_messages"("conversation_id", "created_at");

ALTER TABLE "workspace_agent_providers"
ADD CONSTRAINT "workspace_agent_providers_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_conversations"
ADD CONSTRAINT "agent_conversations_workspace_id_fkey"
FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_conversations"
ADD CONSTRAINT "agent_conversations_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_messages"
ADD CONSTRAINT "agent_messages_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "agent_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
