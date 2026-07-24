package store

import (
	"context"
	"errors"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserStore handles persistence for users.
type UserStore struct {
	pool *pgxpool.Pool
}

const userColumns = `id, azure_oid, email, display_name, avatar_url, is_active, last_login_at, created_at, updated_at`

func scanUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	err := row.Scan(&u.ID, &u.AzureOID, &u.Email, &u.DisplayName, &u.AvatarURL,
		&u.IsActive, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

// UpsertFromAzure creates or updates a user based on Azure AD claims. It is
// called on every SSO login so profile fields stay fresh.
func (s *UserStore) UpsertFromAzure(ctx context.Context, azureOID, email, displayName string) (*domain.User, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO users (azure_oid, email, display_name, last_login_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (azure_oid) DO UPDATE
		SET email = EXCLUDED.email,
		    display_name = EXCLUDED.display_name,
		    last_login_at = now()
		RETURNING `+userColumns, azureOID, email, displayName)
	return scanUser(row)
}

// GetByID fetches a user by id.
func (s *UserStore) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id)
	return scanUser(row)
}
