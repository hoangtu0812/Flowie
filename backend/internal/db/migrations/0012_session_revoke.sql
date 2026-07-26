-- ─────────────────────────────────────────────────────────────
-- Flowie · 0012 · Session revocation (Module 1.1)
-- ─────────────────────────────────────────────────────────────

-- Sessions are revoked by stamping revoked_at rather than deleting the row, so
-- the auth middleware can tell "revoked" apart from "never recorded" (sessions
-- issued before this feature keep working).
ALTER TABLE user_sessions ADD COLUMN revoked_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_sessions_token ON user_sessions(token_hash);
