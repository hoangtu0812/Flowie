-- ─────────────────────────────────────────────────────────────
-- Flowie · 0018 · Two-factor authentication, TOTP (Module 1.1)
-- ─────────────────────────────────────────────────────────────

-- The secret is stored so the server can recompute codes; it is never sent back
-- to the client after enrolment. Recovery codes are stored hashed (SHA-256) so
-- a database leak does not hand over usable backup codes.
ALTER TABLE users ADD COLUMN totp_secret TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN recovery_codes JSONB NOT NULL DEFAULT '[]';
