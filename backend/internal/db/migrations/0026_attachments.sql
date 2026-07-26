-- ─────────────────────────────────────────────────────────────
-- Flowie · 0026 · Task attachments stored in SharePoint (Module 3.5)
-- ─────────────────────────────────────────────────────────────

-- Files live in SharePoint; Flowie only keeps the metadata needed to list and
-- open them, so the two systems stay the single source of truth for their own
-- data (bytes in SharePoint, links in Postgres).
CREATE TABLE attachments (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id       UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    uploaded_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    name          TEXT NOT NULL,
    size_bytes    BIGINT NOT NULL DEFAULT 0,
    content_type  TEXT NOT NULL DEFAULT '',
    drive_item_id TEXT NOT NULL DEFAULT '',
    web_url       TEXT NOT NULL DEFAULT '',
    folder_path   TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attachments_task ON attachments(task_id, created_at DESC);
