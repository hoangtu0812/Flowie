-- ─────────────────────────────────────────────────────────────
-- Flowie · 0008 · Custom Fields & Dependencies (Module 3.4)
-- ─────────────────────────────────────────────────────────────

-- Custom field definitions scoped to project
CREATE TABLE custom_field_defs (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    field_type TEXT NOT NULL, -- text, number, dropdown, date, url, formula
    options    JSONB,         -- for dropdowns
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Custom field values for tasks
CREATE TABLE custom_field_values (
    task_id         UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    custom_field_id UUID NOT NULL REFERENCES custom_field_defs(id) ON DELETE CASCADE,
    value           JSONB NOT NULL,
    PRIMARY KEY (task_id, custom_field_id)
);

-- Task Dependencies
CREATE TABLE task_dependencies (
    task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    type          TEXT NOT NULL DEFAULT 'blocks', -- blocks, blocked_by, related
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (task_id, depends_on_id)
);
