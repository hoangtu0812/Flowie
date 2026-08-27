-- Workspace tools are explicit so admins can remove a capability without
-- changing application code or the behavior of other workspaces.
CREATE TABLE "workspace_agent_tools" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "tool_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workspace_agent_tools_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "user_agent_skills" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "skill_key" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_agent_skills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "workspace_agent_tools_workspace_id_tool_key_key" ON "workspace_agent_tools"("workspace_id", "tool_key");
CREATE INDEX "workspace_agent_tools_workspace_id_idx" ON "workspace_agent_tools"("workspace_id");
CREATE UNIQUE INDEX "user_agent_skills_user_id_skill_key_key" ON "user_agent_skills"("user_id", "skill_key");
CREATE INDEX "user_agent_skills_user_id_idx" ON "user_agent_skills"("user_id");

ALTER TABLE "workspace_agent_tools" ADD CONSTRAINT "workspace_agent_tools_workspace_id_fkey"
    FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_agent_skills" ADD CONSTRAINT "user_agent_skills_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "workspace_agent_tools" ("id", "workspace_id", "tool_key", "created_at", "updated_at")
SELECT concat('agt', substr(md5(workspace.id || tool.tool_key), 1, 22)), workspace.id, tool.tool_key, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "workspaces" AS workspace
CROSS JOIN (VALUES
    ('issues.count'),
    ('issues.overdue'),
    ('issues.by_status'),
    ('issues.by_assignee'),
    ('projects.progress'),
    ('cycles.progress')
) AS tool(tool_key)
ON CONFLICT ("workspace_id", "tool_key") DO NOTHING;
