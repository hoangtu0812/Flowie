-- ─────────────────────────────────────────────────────────────
-- Flowie · 0027 · Workspace invites (Module 1.2)
-- ─────────────────────────────────────────────────────────────

-- Until now a person had to sign in via Azure AD once before an admin could add
-- them. An invite lets an admin pre-authorise an email address: the account is
-- attached to the workspace the first time that person signs in.
CREATE TABLE workspace_invites (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email        TEXT NOT NULL,
    role         TEXT NOT NULL DEFAULT 'member',
    -- Only the hash is stored so a leaked table cannot be used to join.
    token_hash   TEXT NOT NULL UNIQUE,
    invited_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    expires_at   TIMESTAMPTZ NOT NULL,
    accepted_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invites_workspace ON workspace_invites(workspace_id);
-- One pending invite per address per workspace.
CREATE UNIQUE INDEX idx_invites_pending
    ON workspace_invites(workspace_id, lower(email))
    WHERE accepted_at IS NULL;
