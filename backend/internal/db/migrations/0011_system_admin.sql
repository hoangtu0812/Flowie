-- ─────────────────────────────────────────────────────────────
-- Flowie · 0011 · System Admin
-- ─────────────────────────────────────────────────────────────

ALTER TABLE users ADD COLUMN is_system_admin BOOLEAN NOT NULL DEFAULT FALSE;
