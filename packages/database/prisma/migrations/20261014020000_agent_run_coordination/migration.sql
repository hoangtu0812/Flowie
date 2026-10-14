CREATE TABLE project_repositories (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    repository_url TEXT NOT NULL,
    base_branch TEXT NOT NULL,
    test_commands JSONB NOT NULL DEFAULT '[]',
    instructions TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    UNIQUE (project_id,repository_url)
);
CREATE TABLE agent_runs (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    connection_id TEXT NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
    state TEXT NOT NULL DEFAULT 'PENDING',
    fencing_token INTEGER NOT NULL DEFAULT 0,
    lease_token TEXT,
    lease_until TIMESTAMP(3),
    started_at TIMESTAMP(3),
    finished_at TIMESTAMP(3),
    result JSONB,
    created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT agent_run_state CHECK (state IN ('PENDING','RUNNING','AWAITING_REVIEW','FAILED','CANCELED'))
);
CREATE UNIQUE INDEX agent_runs_active_issue ON agent_runs(issue_id) WHERE state IN ('PENDING','RUNNING');
CREATE INDEX agent_runs_workspace_id_state_created_at_idx ON agent_runs(workspace_id,state,created_at);
CREATE TABLE agent_automations (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    connection_id TEXT NOT NULL REFERENCES mcp_connections(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT false,
    daily_limit INTEGER NOT NULL DEFAULT 5,
    created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT agent_automation_limit CHECK (daily_limit BETWEEN 1 AND 25)
);
CREATE INDEX agent_automations_workspace_id_idx ON agent_automations(workspace_id);
CREATE TABLE agent_issue_events (
    id BIGSERIAL PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    processed_at TIMESTAMP(3),
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    failed_at TIMESTAMP(3)
);
CREATE INDEX agent_issue_events_pending ON agent_issue_events(available_at,id) WHERE processed_at IS NULL AND failed_at IS NULL;
CREATE FUNCTION flowie_agent_issue_event() RETURNS TRIGGER AS $$
BEGIN
    -- AI mutations do not recursively enqueue further AI work.
    IF current_setting('flowie.mcp_write',true) IS DISTINCT FROM 'true'
       AND EXISTS (SELECT 1 FROM agent_automations rule WHERE rule.workspace_id=NEW.workspace_id
                   AND rule.project_id=NEW.project_id AND rule.enabled=true) THEN
        INSERT INTO agent_issue_events (workspace_id,issue_id) VALUES (NEW.workspace_id,NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER agent_issue_event AFTER INSERT OR UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION flowie_agent_issue_event();
