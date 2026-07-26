-- ─────────────────────────────────────────────────────────────
-- Flowie · 0022 · Saved views (Module 4)
-- ─────────────────────────────────────────────────────────────

-- A saved view stores the filter/sort/group state of a project board so users
-- can jump back to "my overdue work" or "sprint backlog by priority".
CREATE TABLE saved_views (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    -- NULL owner = shared with everyone on the project.
    owner_id   UUID REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    -- view mode + filters + sort, e.g.
    -- {"view":"list","sort":"due","filters":{"overdue":true}}
    config     JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_views_project ON saved_views(project_id);
