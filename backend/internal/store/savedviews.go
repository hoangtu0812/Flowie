package store

import (
	"context"
	"encoding/json"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SavedViewStore persists per-project saved board views.
type SavedViewStore struct {
	pool *pgxpool.Pool
}

// ListForUser returns a project's views visible to a user: their own plus the
// shared ones.
func (s *SavedViewStore) ListForUser(ctx context.Context, projectID, userID uuid.UUID) ([]domain.SavedView, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, project_id, owner_id, name, config, created_at
		FROM saved_views
		WHERE project_id = $1 AND (owner_id IS NULL OR owner_id = $2)
		ORDER BY created_at`, projectID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.SavedView{}
	for rows.Next() {
		var v domain.SavedView
		var cfg []byte
		if err := rows.Scan(&v.ID, &v.ProjectID, &v.OwnerID, &v.Name, &cfg, &v.CreatedAt); err != nil {
			return nil, err
		}
		v.Config = map[string]any{}
		if len(cfg) > 0 {
			_ = json.Unmarshal(cfg, &v.Config)
		}
		v.Shared = v.OwnerID == nil
		out = append(out, v)
	}
	return out, rows.Err()
}

// Create stores a view. Pass a nil owner to share it with the project.
func (s *SavedViewStore) Create(ctx context.Context, projectID uuid.UUID, owner *uuid.UUID, name string, config map[string]any) (*domain.SavedView, error) {
	if config == nil {
		config = map[string]any{}
	}
	raw, _ := json.Marshal(config)
	var v domain.SavedView
	var cfg []byte
	err := s.pool.QueryRow(ctx, `
		INSERT INTO saved_views (project_id, owner_id, name, config)
		VALUES ($1,$2,$3,$4)
		RETURNING id, project_id, owner_id, name, config, created_at`,
		projectID, owner, name, raw).
		Scan(&v.ID, &v.ProjectID, &v.OwnerID, &v.Name, &cfg, &v.CreatedAt)
	if err != nil {
		return nil, err
	}
	v.Config = map[string]any{}
	if len(cfg) > 0 {
		_ = json.Unmarshal(cfg, &v.Config)
	}
	v.Shared = v.OwnerID == nil
	return &v, nil
}

// Delete removes a view. A user may only delete their own view or, when
// allowShared is set (owner/admin), a shared one.
func (s *SavedViewStore) Delete(ctx context.Context, projectID, viewID, userID uuid.UUID, allowShared bool) error {
	query := `DELETE FROM saved_views WHERE id=$1 AND project_id=$2 AND owner_id=$3`
	args := []any{viewID, projectID, userID}
	if allowShared {
		query = `DELETE FROM saved_views WHERE id=$1 AND project_id=$2 AND (owner_id=$3 OR owner_id IS NULL)`
	}
	res, err := s.pool.Exec(ctx, query, args...)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
