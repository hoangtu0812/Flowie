-- ─────────────────────────────────────────────────────────────
-- Flowie · 0023 · Security audit log (SOC2 groundwork)
-- ─────────────────────────────────────────────────────────────

-- Records security-relevant actions (auth, permission and key changes) that
-- are not covered by activity_events, which only tracks task history.
-- actor_id is nullable so the row survives a GDPR erasure of the actor.
CREATE TABLE audit_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email  TEXT NOT NULL DEFAULT '',
    workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
    action       TEXT NOT NULL,      -- e.g. auth.login, role.assign, apikey.create
    target       TEXT NOT NULL DEFAULT '',
    ip           TEXT NOT NULL DEFAULT '',
    meta         JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_workspace ON audit_log(workspace_id, created_at DESC);
CREATE INDEX idx_audit_actor ON audit_log(actor_id, created_at DESC);
