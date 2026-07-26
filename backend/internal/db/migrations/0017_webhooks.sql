-- ─────────────────────────────────────────────────────────────
-- Flowie · 0017 · Outgoing webhooks (Module 6.2)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE webhooks (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    -- Event names this endpoint wants, e.g. ["task.created","task.status_changed"].
    -- Empty array = every event.
    events      JSONB NOT NULL DEFAULT '[]',
    -- Shared secret used to sign the payload (HMAC-SHA256, X-Flowie-Signature).
    secret      TEXT NOT NULL DEFAULT '',
    active      BOOLEAN NOT NULL DEFAULT TRUE,
    -- Last delivery outcome, for the settings UI.
    last_status INTEGER,
    last_error  TEXT,
    last_sent_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhooks_project ON webhooks(project_id) WHERE active;
