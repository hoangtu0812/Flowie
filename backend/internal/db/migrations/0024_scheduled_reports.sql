-- ─────────────────────────────────────────────────────────────
-- Flowie · 0024 · Scheduled reports (Module 5.2)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE scheduled_reports (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    -- Optional: limit the report to one project. NULL = whole workspace.
    project_id   UUID REFERENCES projects(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    frequency    TEXT NOT NULL DEFAULT 'weekly',   -- daily | weekly
    -- Where to send it: a Slack/Teams incoming webhook URL.
    channel_url  TEXT NOT NULL,
    provider     TEXT NOT NULL DEFAULT 'slack',    -- slack | teams
    hour_utc     INTEGER NOT NULL DEFAULT 1,       -- send hour (0-23, UTC)
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    last_run_at  TIMESTAMPTZ,
    last_status  INTEGER,
    last_error   TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reports_due ON scheduled_reports(active, hour_utc);
