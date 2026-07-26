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

const userColumns = `id, azure_oid, email, display_name, avatar_url, is_system_admin, is_active, last_login_at, created_at, updated_at`

func scanUser(row pgx.Row) (*domain.User, error) {
	var u domain.User
	err := row.Scan(&u.ID, &u.AzureOID, &u.Email, &u.DisplayName, &u.AvatarURL,
		&u.IsSystemAdmin, &u.IsActive, &u.LastLoginAt, &u.CreatedAt, &u.UpdatedAt)
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
func (s *UserStore) UpsertFromAzure(ctx context.Context, azureOID, email, displayName, avatarURL string, isAdmin bool) (*domain.User, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO users (azure_oid, email, display_name, avatar_url, is_system_admin, last_login_at)
		VALUES ($1, $2, $3, $4, $5, now())
		ON CONFLICT (azure_oid) DO UPDATE
		SET email = EXCLUDED.email,
		    display_name = EXCLUDED.display_name,
		    avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), users.avatar_url),
		    is_system_admin = users.is_system_admin OR EXCLUDED.is_system_admin,
		    last_login_at = now()
		RETURNING `+userColumns, azureOID, email, displayName, avatarURL, isAdmin)
	return scanUser(row)
}

// GetByID fetches a user by id.
func (s *UserStore) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+userColumns+` FROM users WHERE id = $1`, id)
	return scanUser(row)
}

// Search returns a page of users, optionally filtered by name or email.
//
// This replaces an unbounded ListAll: an Azure tenant sync leaves thousands of
// rows here, and shipping all of them to the admin page froze the browser.
func (s *UserStore) Search(ctx context.Context, query string, limit, offset int) ([]domain.User, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+userColumns+` FROM users
		WHERE ($1 = '' OR display_name ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%')
		ORDER BY is_system_admin DESC, display_name
		LIMIT $2 OFFSET $3`, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.User{}
	for rows.Next() {
		u, err := scanUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *u)
	}
	return out, rows.Err()
}

// CountUsers returns how many users match the same filter as Search, so the UI
// can show a total and page through it.
func (s *UserStore) CountUsers(ctx context.Context, query string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM users
		WHERE ($1 = '' OR display_name ILIKE '%'||$1||'%' OR email ILIKE '%'||$1||'%')`,
		query).Scan(&n)
	return n, err
}

// SetSystemAdmin sets the is_system_admin flag for a user.
func (s *UserStore) SetSystemAdmin(ctx context.Context, id uuid.UUID, isAdmin bool) error {
	_, err := s.pool.Exec(ctx, `UPDATE users SET is_system_admin = $2 WHERE id = $1`, id, isAdmin)
	return err
}
