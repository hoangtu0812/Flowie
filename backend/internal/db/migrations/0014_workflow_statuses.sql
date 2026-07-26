-- ─────────────────────────────────────────────────────────────
-- Flowie · 0014 · Per-project workflow statuses (Module 3.1)
-- ─────────────────────────────────────────────────────────────

-- tasks.status stays a TEXT key; this table describes the columns a project
-- shows, their order, colour and WIP limit. Projects without rows fall back to
-- the built-in four statuses on the client.
CREATE TABLE workflow_statuses (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    key        TEXT NOT NULL,
    name       TEXT NOT NULL,
    -- todo | in_progress | done — drives "is this column finished work?"
    category   TEXT NOT NULL DEFAULT 'todo',
    color      TEXT NOT NULL DEFAULT 'blue',
    position   DOUBLE PRECISION NOT NULL DEFAULT 0,
    wip_limit  INTEGER,
    UNIQUE (project_id, key)
);

CREATE INDEX idx_workflow_statuses_project ON workflow_statuses(project_id, position);

-- Backfill every existing project with the statuses the UI already used, so
-- boards keep rendering exactly the same columns after this migration.
INSERT INTO workflow_statuses (project_id, key, name, category, color, position)
SELECT p.id, v.key, v.name, v.category, v.color, v.position
FROM projects p
CROSS JOIN (VALUES
    ('todo',        'To Do',     'todo',        'blue',   0.0),
    ('in_progress', 'In Work',   'in_progress', 'purple', 1.0),
    ('in_review',   'On Review', 'in_progress', 'orange', 2.0),
    ('done',        'Done',      'done',        'green',  3.0)
) AS v(key, name, category, color, position)
ON CONFLICT (project_id, key) DO NOTHING;
