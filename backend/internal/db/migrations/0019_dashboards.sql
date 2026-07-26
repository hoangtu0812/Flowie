-- ─────────────────────────────────────────────────────────────
-- Flowie · 0019 · Custom dashboards & widgets (Module 5.1)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE dashboards (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    -- NULL owner = shared with the whole workspace.
    owner_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE dashboard_widgets (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    -- kpi | status_donut | priority_bar | trend | project_table | velocity
    type         TEXT NOT NULL,
    title        TEXT NOT NULL DEFAULT '',
    -- Optional scope + display options, e.g. {"projectId":"…","metric":"openTasks"}
    config       JSONB NOT NULL DEFAULT '{}',
    position     DOUBLE PRECISION NOT NULL DEFAULT 0,
    width        INTEGER NOT NULL DEFAULT 1, -- grid columns (1..3)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_widgets_dashboard ON dashboard_widgets(dashboard_id, position);
CREATE INDEX idx_dashboards_workspace ON dashboards(workspace_id);
