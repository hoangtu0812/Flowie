package store

import (
	"context"
	"time"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SessionStore persists issued sessions so they can be listed and revoked
// remotely (Module 1.1).
type SessionStore struct {
	pool *pgxpool.Pool
}

// Create records a newly issued session. tokenHash must be a digest of the
// token — the raw token is never stored.
func (s *SessionStore) Create(ctx context.Context, userID uuid.UUID, tokenHash, device, ip string, expiresAt time.Time) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO user_sessions (user_id, token_hash, device, ip, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (token_hash) DO UPDATE
		    SET last_seen = now(), revoked_at = NULL, expires_at = EXCLUDED.expires_at`,
		userID, tokenHash, device, ip, expiresAt)
	return err
}

// IsRevoked reports whether a known session has been revoked. Unknown tokens
// return false so sessions issued before this feature keep working.
func (s *SessionStore) IsRevoked(ctx context.Context, tokenHash string) (bool, error) {
	var revoked bool
	err := s.pool.QueryRow(ctx, `
		SELECT COALESCE(revoked_at IS NOT NULL, false)
		FROM user_sessions WHERE token_hash = $1`, tokenHash).Scan(&revoked)
	if err != nil {
		// No row → not a tracked session; treat as active.
		return false, nil
	}
	return revoked, nil
}

// Touch refreshes last_seen, throttled to at most once every 5 minutes so an
// active session does not write on every request.
func (s *SessionStore) Touch(ctx context.Context, tokenHash string) {
	_, _ = s.pool.Exec(ctx, `
		UPDATE user_sessions SET last_seen = now()
		WHERE token_hash = $1 AND last_seen < now() - interval '5 minutes'`, tokenHash)
}

// ListForUser returns a user's active (non-expired, non-revoked) sessions.
func (s *SessionStore) ListForUser(ctx context.Context, userID uuid.UUID) ([]domain.UserSession, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, device, ip, last_seen, expires_at, created_at
		FROM user_sessions
		WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > now()
		ORDER BY last_seen DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.UserSession{}
	for rows.Next() {
		var s domain.UserSession
		if err := rows.Scan(&s.ID, &s.Device, &s.IP, &s.LastSeen, &s.ExpiresAt, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// Revoke marks one of the user's sessions as revoked.
func (s *SessionStore) Revoke(ctx context.Context, userID, sessionID uuid.UUID) error {
	res, err := s.pool.Exec(ctx, `
		UPDATE user_sessions SET revoked_at = now()
		WHERE id = $2 AND user_id = $1 AND revoked_at IS NULL`, userID, sessionID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// RevokeByToken marks the session matching a token hash as revoked (logout).
func (s *SessionStore) RevokeByToken(ctx context.Context, tokenHash string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1`, tokenHash)
	return err
}

// Rotate retires a session token and issues a row for its replacement.
//
// The old row is *marked revoked* rather than updated in place: IsRevoked
// treats an unknown hash as valid (so sessions predating device tracking keep
// working), which means simply overwriting the hash would leave the old token
// silently usable until its JWT expiry. Stamping revoked_at is what actually
// kills it.
//
// Returns ErrNotFound when the old hash is unknown or already revoked, so a
// replayed token cannot mint a fresh session.
func (s *SessionStore) Rotate(ctx context.Context, userID uuid.UUID, oldHash, newHash string, expiresAt time.Time) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var device, ip string
	err = tx.QueryRow(ctx, `
		UPDATE user_sessions SET revoked_at = now()
		WHERE token_hash = $1 AND user_id = $2 AND revoked_at IS NULL
		RETURNING device, ip`, oldHash, userID).Scan(&device, &ip)
	if err != nil {
		return ErrNotFound
	}

	// Carry the device/IP across so the account page still shows one entry.
	if _, err := tx.Exec(ctx, `
		INSERT INTO user_sessions (user_id, token_hash, device, ip, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (token_hash) DO UPDATE
		    SET revoked_at = NULL, expires_at = EXCLUDED.expires_at, last_seen = now()`,
		userID, newHash, device, ip, expiresAt); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// IDByToken resolves the session row matching a token hash, so the caller's own
// session can be labelled in the device list.
func (s *SessionStore) IDByToken(ctx context.Context, tokenHash string) (uuid.UUID, error) {
	var id uuid.UUID
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM user_sessions WHERE token_hash = $1`, tokenHash).Scan(&id)
	if err != nil {
		return uuid.Nil, ErrNotFound
	}
	return id, nil
}

// MarkCurrent flags which of the listed sessions matches the caller's token.
func MarkCurrent(sessions []domain.UserSession, currentID uuid.UUID) {
	for i := range sessions {
		if sessions[i].ID == currentID {
			sessions[i].Current = true
		}
	}
}
