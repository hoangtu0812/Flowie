-- ─────────────────────────────────────────────────────────────
-- Flowie · 0006 · Automation rules (Module 6.1) — MVP
-- Trigger: task status changes to `trigger_status`
-- Action:  assign to `action_assignee_id` (+ notify)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE automation_rules (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id         UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name               TEXT NOT NULL DEFAULT '',
    trigger_status     TEXT NOT NULL,
    action_type        TEXT NOT NULL DEFAULT 'assign', -- assign
    action_assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
    active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_automation_project ON automation_rules(project_id) WHERE active;
