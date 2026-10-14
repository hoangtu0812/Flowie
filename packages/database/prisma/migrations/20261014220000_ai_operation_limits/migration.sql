CREATE TABLE ai_workspace_limits (
    workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
    total_per_minute INTEGER NOT NULL DEFAULT 300,
    per_tool JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')
);
CREATE TABLE ai_tool_windows (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
    tool TEXT NOT NULL, window_start TIMESTAMP(3) NOT NULL, used INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(workspace_id,tool,window_start)
);
CREATE INDEX ai_tool_windows_window_start_idx ON ai_tool_windows(window_start);
