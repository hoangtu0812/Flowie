package store

import (
	"context"
	"encoding/json"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuditStore records security-relevant events for compliance review.
type AuditStore struct {
	pool *pgxpool.Pool
}

// Audit action names. Keeping them as constants avoids typos drifting between
// call sites and makes the set greppable.
const (
	AuditLogin          = "auth.login"
	AuditLogout         = "auth.logout"
	AuditMFAEnabled     = "auth.mfa_enabled"
	AuditMFADisabled    = "auth.mfa_disabled"
	AuditMFAVerified    = "auth.mfa_verified"
	AuditSessionRevoked = "auth.session_revoked"
	AuditRoleChanged    = "iam.role_changed"
	AuditCustomRoleSet  = "iam.custom_role_assigned"
	AuditMemberAdded    = "iam.member_added"
	AuditAPIKeyCreated  = "apikey.created"
	AuditAPIKeyRevoked  = "apikey.revoked"
	AuditDataExported   = "privacy.data_exported"
	AuditAccountErased  = "privacy.account_erased"
	AuditWorkspaceDel   = "workspace.deleted"
)

// AuditEntry carries the fields of one audit record.
type AuditEntry struct {
	ActorID     *uuid.UUID
	ActorEmail  string
	WorkspaceID *uuid.UUID
	Action      string
	Target      string
	IP          string
	Meta        map[string]any
}

// Record writes an audit row. Failures are swallowed: auditing must never break
// the user's request, and the error is not actionable at the call site.
func (s *AuditStore) Record(ctx context.Context, e AuditEntry) {
	meta := e.Meta
	if meta == nil {
		meta = map[string]any{}
	}
	raw, _ := json.Marshal(meta)
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO audit_log (actor_id, actor_email, workspace_id, action, target, ip, meta)
		VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		e.ActorID, e.ActorEmail, e.WorkspaceID, e.Action, e.Target, e.IP, raw)
}

// List returns recent audit entries, optionally scoped to a workspace.
func (s *AuditStore) List(ctx context.Context, workspaceID *uuid.UUID, limit int) ([]domain.AuditEntry, error) {
	if limit <= 0 || limit > 500 {
		limit = 200
	}
	query := `
		SELECT a.id, a.actor_id, a.actor_email, a.workspace_id, a.action, a.target, a.ip, a.meta, a.created_at
		FROM audit_log a
		WHERE ($1::uuid IS NULL OR a.workspace_id = $1)
		ORDER BY a.created_at DESC
		LIMIT $2`
	rows, err := s.pool.Query(ctx, query, workspaceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.AuditEntry{}
	for rows.Next() {
		var e domain.AuditEntry
		var meta []byte
		if err := rows.Scan(&e.ID, &e.ActorID, &e.ActorEmail, &e.WorkspaceID,
			&e.Action, &e.Target, &e.IP, &meta, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.Meta = map[string]any{}
		if len(meta) > 0 {
			_ = json.Unmarshal(meta, &e.Meta)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
