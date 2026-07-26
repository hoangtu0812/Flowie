-- ─────────────────────────────────────────────────────────────
-- Flowie · 0020 · Public API keys (Module 6.2)
-- ─────────────────────────────────────────────────────────────

-- Only a hash of the key is stored; the plaintext is shown once at creation.
-- `prefix` is the visible first characters so users can tell keys apart.
CREATE TABLE api_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    name         TEXT NOT NULL,
    prefix       TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    -- Scopes limit what the key can do, e.g. ["read","write"].
    scopes       JSONB NOT NULL DEFAULT '["read"]',
    last_used_at TIMESTAMPTZ,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_api_keys_workspace ON api_keys(workspace_id) WHERE revoked_at IS NULL;
