-- ─────────────────────────────────────────────────────────────
-- Flowie · 0013 · Running timers (Module 3.3)
-- ─────────────────────────────────────────────────────────────

-- One running timer per user: the primary key on user_id enforces it, so
-- starting a second timer replaces (or is rejected against) the first.
CREATE TABLE active_timers (
    user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    task_id    UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    note       TEXT NOT NULL DEFAULT '',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
