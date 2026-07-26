-- ─────────────────────────────────────────────────────────────
-- Flowie · 0021 · Native integrations: Slack / MS Teams (Module 6.3)
-- ─────────────────────────────────────────────────────────────

-- Slack and Teams both accept an "incoming webhook" URL that posts a JSON
-- message. Storing the provider lets us shape the payload per platform.
CREATE TABLE integrations (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider   TEXT NOT NULL,           -- slack | teams
    webhook_url TEXT NOT NULL,
    events     JSONB NOT NULL DEFAULT '[]',  -- empty = all
    active     BOOLEAN NOT NULL DEFAULT TRUE,
    last_status INTEGER,
    last_error  TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_integrations_project ON integrations(project_id) WHERE active;
