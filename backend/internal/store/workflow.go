package store

import (
	"context"
	"errors"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
)

// ErrLastStatus is returned when deleting the only remaining board column.
var ErrLastStatus = errors.New("cannot delete the last status")

// DefaultStatuses is the column set seeded for every new project. It mirrors
// what the UI shipped with before statuses became configurable.
var DefaultStatuses = []struct {
	Key, Name, Category, Color string
}{
	{"todo", "To Do", "todo", "blue"},
	{"in_progress", "In Work", "in_progress", "purple"},
	{"in_review", "On Review", "in_progress", "orange"},
	{"done", "Done", "done", "green"},
}

// SeedDefaultStatuses creates the built-in columns for a newly created project.
func (s *TaskStore) SeedDefaultStatuses(ctx context.Context, projectID uuid.UUID) error {
	for i, d := range DefaultStatuses {
		if _, err := s.pool.Exec(ctx, `
			INSERT INTO workflow_statuses (project_id, key, name, category, color, position)
			VALUES ($1, $2, $3, $4, $5, $6)
			ON CONFLICT (project_id, key) DO NOTHING`,
			projectID, d.Key, d.Name, d.Category, d.Color, float64(i)); err != nil {
			return err
		}
	}
	return nil
}

// ListStatuses returns a project's board columns with live task counts.
func (s *TaskStore) ListStatuses(ctx context.Context, projectID uuid.UUID) ([]domain.WorkflowStatus, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT w.id, w.project_id, w.key, w.name, w.category, w.color, w.position, w.wip_limit,
		       (SELECT count(*) FROM tasks t
		         WHERE t.project_id = w.project_id AND t.status = w.key
		           AND t.parent_task_id IS NULL)
		FROM workflow_statuses w
		WHERE w.project_id = $1
		ORDER BY w.position`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.WorkflowStatus{}
	for rows.Next() {
		var st domain.WorkflowStatus
		if err := rows.Scan(&st.ID, &st.ProjectID, &st.Key, &st.Name, &st.Category,
			&st.Color, &st.Position, &st.WIPLimit, &st.TaskCount); err != nil {
			return nil, err
		}
		out = append(out, st)
	}
	return out, rows.Err()
}

// CreateStatus appends a column to a project's board.
func (s *TaskStore) CreateStatus(ctx context.Context, projectID uuid.UUID, key, name, category, color string, wipLimit *int) (*domain.WorkflowStatus, error) {
	var st domain.WorkflowStatus
	err := s.pool.QueryRow(ctx, `
		INSERT INTO workflow_statuses (project_id, key, name, category, color, position, wip_limit)
		VALUES ($1, $2, $3, $4, $5,
		        COALESCE((SELECT MAX(position)+1 FROM workflow_statuses WHERE project_id=$1), 0),
		        $6)
		RETURNING id, project_id, key, name, category, color, position, wip_limit`,
		projectID, key, name, category, color, wipLimit).
		Scan(&st.ID, &st.ProjectID, &st.Key, &st.Name, &st.Category, &st.Color, &st.Position, &st.WIPLimit)
	return &st, err
}

// StatusUpdateFields carries optional column edits.
type StatusUpdateFields struct {
	Name     *string
	Category *string
	Color    *string
	Position *float64

	SetWIPLimit bool
	WIPLimit    *int
}

// UpdateWorkflowStatus patches a board column.
func (s *TaskStore) UpdateWorkflowStatus(ctx context.Context, projectID, statusID uuid.UUID, f StatusUpdateFields) error {
	res, err := s.pool.Exec(ctx, `
		UPDATE workflow_statuses SET
		    name = COALESCE($3, name),
		    category = COALESCE($4, category),
		    color = COALESCE($5, color),
		    position = COALESCE($6, position),
		    wip_limit = CASE WHEN $7 THEN $8 ELSE wip_limit END
		WHERE id = $2 AND project_id = $1`,
		projectID, statusID, f.Name, f.Category, f.Color, f.Position, f.SetWIPLimit, f.WIPLimit)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// CountTasksInStatus reports how many top-level tasks sit in a column, used to
// enforce WIP limits.
func (s *TaskStore) CountTasksInStatus(ctx context.Context, projectID uuid.UUID, statusKey string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `
		SELECT count(*) FROM tasks
		WHERE project_id = $1 AND status = $2 AND parent_task_id IS NULL`,
		projectID, statusKey).Scan(&n)
	return n, err
}

// WIPLimitFor returns the configured WIP limit for a column, or nil when the
// project has no such column or no limit set.
func (s *TaskStore) WIPLimitFor(ctx context.Context, projectID uuid.UUID, statusKey string) (*int, error) {
	var limit *int
	err := s.pool.QueryRow(ctx, `
		SELECT wip_limit FROM workflow_statuses WHERE project_id = $1 AND key = $2`,
		projectID, statusKey).Scan(&limit)
	if err != nil {
		return nil, nil // no column defined → no limit
	}
	return limit, nil
}

// DeleteStatus removes a column. Tasks still in it are moved to the fallback
// column (the first remaining one by position) so no task is orphaned.
func (s *TaskStore) DeleteStatus(ctx context.Context, projectID, statusID uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var key string
	if err := tx.QueryRow(ctx,
		`SELECT key FROM workflow_statuses WHERE id = $1 AND project_id = $2`,
		statusID, projectID).Scan(&key); err != nil {
		return ErrNotFound
	}

	var fallback string
	err = tx.QueryRow(ctx, `
		SELECT key FROM workflow_statuses
		WHERE project_id = $1 AND id <> $2
		ORDER BY position LIMIT 1`, projectID, statusID).Scan(&fallback)
	if err != nil {
		// Refuse to delete the last column — the board would have nowhere to put tasks.
		return ErrLastStatus
	}

	if _, err := tx.Exec(ctx,
		`UPDATE tasks SET status = $3 WHERE project_id = $1 AND status = $2`,
		projectID, key, fallback); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`DELETE FROM workflow_statuses WHERE id = $1 AND project_id = $2`,
		statusID, projectID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
