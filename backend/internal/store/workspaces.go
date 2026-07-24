package store

import (
	"context"
	"errors"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WorkspaceStore handles persistence for workspaces and memberships.
type WorkspaceStore struct {
	pool *pgxpool.Pool
}

const workspaceColumns = `id, name, slug, sharepoint_folder_path, sharepoint_item_id, created_by, created_at, updated_at`

func scanWorkspace(row pgx.Row) (*domain.Workspace, error) {
	var w domain.Workspace
	err := row.Scan(&w.ID, &w.Name, &w.Slug, &w.SharePointFolderPath,
		&w.SharePointItemID, &w.CreatedBy, &w.CreatedAt, &w.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &w, nil
}

// Create inserts a workspace and adds the creator as owner in one transaction.
func (s *WorkspaceStore) Create(ctx context.Context, name, slug string, createdBy uuid.UUID) (*domain.Workspace, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after commit

	row := tx.QueryRow(ctx, `
		INSERT INTO workspaces (name, slug, created_by)
		VALUES ($1, $2, $3)
		RETURNING `+workspaceColumns, name, slug, createdBy)
	ws, err := scanWorkspace(row)
	if err != nil {
		return nil, err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO workspace_members (workspace_id, user_id, role)
		VALUES ($1, $2, 'owner')`, ws.ID, createdBy); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return ws, nil
}

// SetSharePointFolder records the synced SharePoint folder path/item id.
func (s *WorkspaceStore) SetSharePointFolder(ctx context.Context, id uuid.UUID, path, itemID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE workspaces SET sharepoint_folder_path = $2, sharepoint_item_id = $3
		WHERE id = $1`, id, path, itemID)
	return err
}

// GetByID fetches a workspace by id.
func (s *WorkspaceStore) GetByID(ctx context.Context, id uuid.UUID) (*domain.Workspace, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+workspaceColumns+` FROM workspaces WHERE id = $1`, id)
	return scanWorkspace(row)
}

// ListForUser returns workspaces the user is a member of.
func (s *WorkspaceStore) ListForUser(ctx context.Context, userID uuid.UUID) ([]domain.Workspace, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+prefixCols("w", workspaceColumns)+`
		FROM workspaces w
		JOIN workspace_members m ON m.workspace_id = w.id
		WHERE m.user_id = $1
		ORDER BY w.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Workspace
	for rows.Next() {
		w, err := scanWorkspace(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *w)
	}
	return out, rows.Err()
}

// ListMembers returns a workspace's members with profile + billing rate.
func (s *WorkspaceStore) ListMembers(ctx context.Context, workspaceID uuid.UUID) ([]domain.MemberInfo, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT u.id, u.display_name, u.email::text, u.avatar_url, m.role,
		       COALESCE(r.hourly_rate, 0), COALESCE(r.currency, 'USD')
		FROM workspace_members m
		JOIN users u ON u.id = m.user_id
		LEFT JOIN user_rates r ON r.user_id = u.id
		WHERE m.workspace_id = $1
		ORDER BY u.display_name`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.MemberInfo{}
	for rows.Next() {
		var m domain.MemberInfo
		if err := rows.Scan(&m.UserID, &m.DisplayName, &m.Email, &m.AvatarURL, &m.Role, &m.HourlyRate, &m.Currency); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// AddMemberByEmail adds an existing user (looked up by email) to a workspace.
// Returns ErrNotFound if no user with that email exists yet.
func (s *WorkspaceStore) AddMemberByEmail(ctx context.Context, workspaceID uuid.UUID, email string, role domain.WorkspaceRole) (*domain.MemberInfo, error) {
	var userID uuid.UUID
	var name, mail string
	err := s.pool.QueryRow(ctx, `SELECT id, display_name, email::text FROM users WHERE email = $1`, email).
		Scan(&userID, &name, &mail)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	_, err = s.pool.Exec(ctx, `
		INSERT INTO workspace_members (workspace_id, user_id, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		workspaceID, userID, role)
	if err != nil {
		return nil, err
	}
	return &domain.MemberInfo{UserID: userID, DisplayName: name, Email: mail, Role: role, Currency: "USD"}, nil
}

// UpdateMemberRole changes a member's workspace role.
func (s *WorkspaceStore) UpdateMemberRole(ctx context.Context, workspaceID, userID uuid.UUID, role domain.WorkspaceRole) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE workspace_members SET role=$3 WHERE workspace_id=$1 AND user_id=$2`,
		workspaceID, userID, role)
	return err
}

// SetRate upserts a user's hourly billing rate.
func (s *WorkspaceStore) SetRate(ctx context.Context, userID uuid.UUID, rate float64, currency string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO user_rates (user_id, hourly_rate, currency, updated_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (user_id) DO UPDATE SET hourly_rate=EXCLUDED.hourly_rate, currency=EXCLUDED.currency, updated_at=now()`,
		userID, rate, currency)
	return err
}

// RoleForUser returns the user's workspace role, or ErrNotFound if not a member.
func (s *WorkspaceStore) RoleForUser(ctx context.Context, workspaceID, userID uuid.UUID) (domain.WorkspaceRole, error) {
	var role domain.WorkspaceRole
	err := s.pool.QueryRow(ctx, `
		SELECT role FROM workspace_members WHERE workspace_id = $1 AND user_id = $2`,
		workspaceID, userID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrNotFound
		}
		return "", err
	}
	return role, nil
}

// ListAll returns all workspaces in the system.
func (s *WorkspaceStore) ListAll(ctx context.Context) ([]domain.Workspace, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+workspaceColumns+` FROM workspaces ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Workspace
	for rows.Next() {
		w, err := scanWorkspace(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *w)
	}
	return out, rows.Err()
}

// Delete permanently removes a workspace and all its cascade dependencies.
func (s *WorkspaceStore) Delete(ctx context.Context, id uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM workspaces WHERE id = $1`, id)
	return err
}
