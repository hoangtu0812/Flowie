-- ─────────────────────────────────────────────────────────────
-- Flowie · 0005 · Notifications (Module 7.1)
-- ─────────────────────────────────────────────────────────────

CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT NOT NULL,          -- assigned | commented | mentioned | due_soon
    title      TEXT NOT NULL,
    body       TEXT NOT NULL DEFAULT '',
    task_id    UUID REFERENCES tasks(id) ON DELETE CASCADE,
    read_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id) WHERE read_at IS NULL;
