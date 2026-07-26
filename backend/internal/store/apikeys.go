package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"strings"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// APIKeyStore persists public API keys.
type APIKeyStore struct {
	pool *pgxpool.Pool
}

// apiKeyPrefix marks Flowie keys so they are recognisable in logs and secret
// scanners.
const apiKeyPrefix = "flw_"

// GenerateAPIKey returns a new random key in plaintext. It is shown to the user
// once and never stored as-is.
func GenerateAPIKey() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return apiKeyPrefix + base64.RawURLEncoding.EncodeToString(buf), nil
}

// HashAPIKey returns the digest stored for a key.
func HashAPIKey(key string) string {
	sum := sha256.Sum256([]byte(key))
	return hex.EncodeToString(sum[:])
}

// visiblePrefix returns the short, non-secret part shown in the UI.
func visiblePrefix(key string) string {
	if len(key) <= len(apiKeyPrefix)+6 {
		return key
	}
	return key[:len(apiKeyPrefix)+6]
}

// Create stores a new key and returns the record (without the plaintext).
func (s *APIKeyStore) Create(ctx context.Context, workspaceID, createdBy uuid.UUID, name string, scopes []string, plaintext string) (*domain.APIKey, error) {
	if len(scopes) == 0 {
		scopes = []string{"read"}
	}
	raw, _ := json.Marshal(scopes)
	var k domain.APIKey
	var sc []byte
	err := s.pool.QueryRow(ctx, `
		INSERT INTO api_keys (workspace_id, created_by, name, prefix, key_hash, scopes)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, workspace_id, name, prefix, scopes, last_used_at, revoked_at, created_at`,
		workspaceID, createdBy, name, visiblePrefix(plaintext), HashAPIKey(plaintext), raw).
		Scan(&k.ID, &k.WorkspaceID, &k.Name, &k.Prefix, &sc, &k.LastUsedAt, &k.RevokedAt, &k.CreatedAt)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(sc, &k.Scopes)
	k.Active = k.RevokedAt == nil
	return &k, nil
}

// ListByWorkspace returns a workspace's keys (never the secret).
func (s *APIKeyStore) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]domain.APIKey, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, workspace_id, name, prefix, scopes, last_used_at, revoked_at, created_at
		FROM api_keys WHERE workspace_id=$1 ORDER BY created_at DESC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.APIKey{}
	for rows.Next() {
		var k domain.APIKey
		var sc []byte
		if err := rows.Scan(&k.ID, &k.WorkspaceID, &k.Name, &k.Prefix, &sc,
			&k.LastUsedAt, &k.RevokedAt, &k.CreatedAt); err != nil {
			return nil, err
		}
		k.Scopes = []string{}
		if len(sc) > 0 {
			_ = json.Unmarshal(sc, &k.Scopes)
		}
		k.Active = k.RevokedAt == nil
		out = append(out, k)
	}
	return out, rows.Err()
}

// Revoke marks a key unusable.
func (s *APIKeyStore) Revoke(ctx context.Context, workspaceID, id uuid.UUID) error {
	res, err := s.pool.Exec(ctx, `
		UPDATE api_keys SET revoked_at = now()
		WHERE id=$1 AND workspace_id=$2 AND revoked_at IS NULL`, id, workspaceID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ResolvedKey is what a valid API key grants.
type ResolvedKey struct {
	KeyID       uuid.UUID
	WorkspaceID uuid.UUID
	Scopes      []string
}

// Resolve looks up an active key by its plaintext value and records usage.
// Returns ErrNotFound for unknown or revoked keys.
func (s *APIKeyStore) Resolve(ctx context.Context, plaintext string) (*ResolvedKey, error) {
	plaintext = strings.TrimSpace(plaintext)
	if plaintext == "" {
		return nil, ErrNotFound
	}
	var r ResolvedKey
	var sc []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, workspace_id, scopes FROM api_keys
		WHERE key_hash = $1 AND revoked_at IS NULL`, HashAPIKey(plaintext)).
		Scan(&r.KeyID, &r.WorkspaceID, &sc)
	if err != nil {
		return nil, ErrNotFound
	}
	_ = json.Unmarshal(sc, &r.Scopes)

	// Usage timestamp is throttled to avoid a write on every request.
	_, _ = s.pool.Exec(ctx, `
		UPDATE api_keys SET last_used_at = now()
		WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`, r.KeyID)
	return &r, nil
}

// HasScope reports whether a resolved key carries a scope.
func (r *ResolvedKey) HasScope(scope string) bool {
	for _, s := range r.Scopes {
		if s == scope {
			return true
		}
	}
	return false
}
