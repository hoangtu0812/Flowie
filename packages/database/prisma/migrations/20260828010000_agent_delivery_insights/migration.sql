-- Delivery insight tools are installed for existing workspaces so the first
-- report is useful immediately while workspace administrators retain removal control.
INSERT INTO "workspace_agent_tools" ("id", "workspace_id", "tool_key", "created_at", "updated_at")
SELECT concat('agt', substr(md5(workspace.id || tool.tool_key), 1, 22)), workspace.id, tool.tool_key, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "workspaces" AS workspace
CROSS JOIN (VALUES
    ('projects.delivery'),
    ('issues.stale'),
    ('initiatives.delivery')
) AS tool(tool_key)
ON CONFLICT ("workspace_id", "tool_key") DO NOTHING;
