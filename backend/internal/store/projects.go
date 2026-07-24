package store

import (
	"context"
	"errors"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ProjectStore handles persistence for projects and memberships.
type ProjectStore struct {
	pool *pgxpool.Pool
}

const projectColumns = `id, workspace_id, portfolio_id, name, key, description, status, sharepoint_folder_path, sharepoint_item_id, start_date, end_date, created_by, created_at, updated_at`

func scanProject(row pgx.Row) (*domain.Project, error) {
	var p domain.Project
	err := row.Scan(&p.ID, &p.WorkspaceID, &p.PortfolioID, &p.Name, &p.Key,
		&p.Description, &p.Status, &p.SharePointFolderPath, &p.SharePointItemID,
		&p.StartDate, &p.EndDate, &p.CreatedBy, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

// CreateParams carries the inputs required to create a project.
type CreateProjectParams struct {
	WorkspaceID uuid.UUID
	Name        string
	Key         string
	Description string
	CreatedBy   uuid.UUID
}

// Create inserts a project and adds the creator as manager in one transaction.
func (s *ProjectStore) Create(ctx context.Context, p CreateProjectParams) (*domain.Project, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	row := tx.QueryRow(ctx, `
		INSERT INTO projects (workspace_id, name, key, description, created_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING `+projectColumns, p.WorkspaceID, p.Name, p.Key, p.Description, p.CreatedBy)
	proj, err := scanProject(row)
	if err != nil {
		return nil, err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO project_members (project_id, user_id, role)
		VALUES ($1, $2, 'manager')`, proj.ID, p.CreatedBy); err != nil {
		return nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return proj, nil
}

// SetSharePointFolder records the synced SharePoint folder path/item id.
func (s *ProjectStore) SetSharePointFolder(ctx context.Context, id uuid.UUID, path, itemID string) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE projects SET sharepoint_folder_path = $2, sharepoint_item_id = $3
		WHERE id = $1`, id, path, itemID)
	return err
}

// GetByID fetches a project by id.
func (s *ProjectStore) GetByID(ctx context.Context, id uuid.UUID) (*domain.Project, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+projectColumns+` FROM projects WHERE id = $1`, id)
	return scanProject(row)
}

// ListByWorkspace returns active + archived projects in a workspace.
func (s *ProjectStore) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]domain.Project, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+projectColumns+` FROM projects
		WHERE workspace_id = $1 ORDER BY created_at DESC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Project
	for rows.Next() {
		p, err := scanProject(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}
