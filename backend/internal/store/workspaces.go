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
