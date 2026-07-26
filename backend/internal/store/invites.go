package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"strings"
	"time"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// InviteStore persists workspace invitations.
type InviteStore struct {
	pool *pgxpool.Pool
}

// GenerateInviteToken returns the secret handed to the invitee.
func GenerateInviteToken() (string, error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

// HashInviteToken returns the digest stored in the database.
func HashInviteToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Create issues an invite, replacing any pending one for the same address.
func (s *InviteStore) Create(ctx context.Context, workspaceID uuid.UUID, email string, role domain.WorkspaceRole, invitedBy uuid.UUID, token string, ttl time.Duration) (*domain.WorkspaceInvite, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	// Re-inviting someone should refresh the invite rather than fail on the
	// pending-unique index.
	if _, err := s.pool.Exec(ctx, `
		DELETE FROM workspace_invites
		WHERE workspace_id = $1 AND lower(email) = $2 AND accepted_at IS NULL`,
		workspaceID, email); err != nil {
		return nil, err
	}

	var in domain.WorkspaceInvite
	err := s.pool.QueryRow(ctx, `
		INSERT INTO workspace_invites (workspace_id, email, role, token_hash, invited_by, expires_at)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, workspace_id, email, role, invited_by, expires_at, accepted_at, created_at`,
		workspaceID, email, role, HashInviteToken(token), invitedBy, time.Now().Add(ttl)).
		Scan(&in.ID, &in.WorkspaceID, &in.Email, &in.Role, &in.InvitedBy,
			&in.ExpiresAt, &in.AcceptedAt, &in.CreatedAt)
	return &in, err
}

// ListPending returns a workspace's outstanding invites.
func (s *InviteStore) ListPending(ctx context.Context, workspaceID uuid.UUID) ([]domain.WorkspaceInvite, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, workspace_id, email, role, invited_by, expires_at, accepted_at, created_at
		FROM workspace_invites
		WHERE workspace_id = $1 AND accepted_at IS NULL
		ORDER BY created_at DESC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.WorkspaceInvite{}
	for rows.Next() {
		var in domain.WorkspaceInvite
		if err := rows.Scan(&in.ID, &in.WorkspaceID, &in.Email, &in.Role, &in.InvitedBy,
			&in.ExpiresAt, &in.AcceptedAt, &in.CreatedAt); err != nil {
			return nil, err
		}
		in.Expired = time.Now().After(in.ExpiresAt)
		out = append(out, in)
	}
	return out, rows.Err()
}

// Revoke removes a pending invite.
func (s *InviteStore) Revoke(ctx context.Context, workspaceID, id uuid.UUID) error {
	res, err := s.pool.Exec(ctx,
		`DELETE FROM workspace_invites WHERE id=$1 AND workspace_id=$2 AND accepted_at IS NULL`,
		id, workspaceID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Accept redeems a token for a user, adding them to the workspace.
//
// The invite is bound to the email it was sent to, so forwarding the link to
// someone else does not grant them access.
func (s *InviteStore) Accept(ctx context.Context, token string, userID uuid.UUID, userEmail string) (*domain.WorkspaceInvite, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var in domain.WorkspaceInvite
	err = tx.QueryRow(ctx, `
		SELECT id, workspace_id, email, role, invited_by, expires_at, accepted_at, created_at
		FROM workspace_invites
		WHERE token_hash = $1 AND accepted_at IS NULL AND expires_at > now()
		FOR UPDATE`, HashInviteToken(token)).
		Scan(&in.ID, &in.WorkspaceID, &in.Email, &in.Role, &in.InvitedBy,
			&in.ExpiresAt, &in.AcceptedAt, &in.CreatedAt)
	if err != nil {
		return nil, ErrNotFound
	}
	if !strings.EqualFold(in.Email, strings.TrimSpace(userEmail)) {
		return nil, ErrInviteEmailMismatch
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO workspace_members (workspace_id, user_id, role)
		VALUES ($1,$2,$3)
		ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		in.WorkspaceID, userID, in.Role); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(ctx,
		`UPDATE workspace_invites SET accepted_at = now() WHERE id = $1`, in.ID); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &in, nil
}
