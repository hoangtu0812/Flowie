-- ─────────────────────────────────────────────────────────────
-- Flowie · 0003 · Sprints & Backlog (Module 3.2)
-- ─────────────────────────────────────────────────────────────

CREATE TYPE sprint_state AS ENUM ('planned', 'active', 'completed');

CREATE TABLE sprints (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    goal       TEXT NOT NULL DEFAULT '',
    state      sprint_state NOT NULL DEFAULT 'planned',
    start_date DATE,
    end_date   DATE,
    position   DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sprints_project ON sprints(project_id);

-- Task thuộc về một sprint; NULL = nằm trong Backlog.
ALTER TABLE tasks ADD COLUMN sprint_id UUID REFERENCES sprints(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_sprint ON tasks(sprint_id);

CREATE TRIGGER trg_sprints_updated BEFORE UPDATE ON sprints
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
