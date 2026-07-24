package store

import (
	"context"
	"errors"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
)

// ErrDependencyCycle is returned when adding a dependency would create a cycle.
var ErrDependencyCycle = errors.New("dependency cycle")

// ErrSelfDependency is returned when a task is made to depend on itself.
var ErrSelfDependency = errors.New("a task cannot depend on itself")

// AddDependency records that taskID depends on (is blocked by) dependsOnID.
// It rejects self-references and any edge that would close a cycle.
func (s *TaskStore) AddDependency(ctx context.Context, taskID, dependsOnID uuid.UUID) error {
	if taskID == dependsOnID {
		return ErrSelfDependency
	}

	// A cycle forms if dependsOnID already (transitively) depends on taskID:
	// adding taskID → dependsOnID would then be reachable back to taskID.
	var cycle bool
	err := s.pool.QueryRow(ctx, `
		WITH RECURSIVE reach AS (
		    SELECT depends_on_id FROM task_dependencies WHERE task_id = $1
		    UNION
		    SELECT td.depends_on_id
		    FROM task_dependencies td
		    JOIN reach r ON td.task_id = r.depends_on_id
		)
		SELECT EXISTS(SELECT 1 FROM reach WHERE depends_on_id = $2)`,
		dependsOnID, taskID).Scan(&cycle)
	if err != nil {
		return err
	}
	if cycle {
		return ErrDependencyCycle
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO task_dependencies (task_id, depends_on_id, type)
		VALUES ($1, $2, 'blocks')
		ON CONFLICT (task_id, depends_on_id) DO NOTHING`, taskID, dependsOnID)
	return err
}

// RemoveDependency deletes the edge taskID → dependsOnID.
func (s *TaskStore) RemoveDependency(ctx context.Context, taskID, dependsOnID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM task_dependencies WHERE task_id = $1 AND depends_on_id = $2`,
		taskID, dependsOnID)
	return err
}

// ListDependencies returns the tasks that block taskID (BlockedBy) and the
// tasks that taskID blocks (Blocks), each enriched with title/status/key.
func (s *TaskStore) ListDependencies(ctx context.Context, taskID uuid.UUID) (*domain.TaskDependencies, error) {
	out := &domain.TaskDependencies{
		BlockedBy: []domain.TaskDependencyItem{},
		Blocks:    []domain.TaskDependencyItem{},
	}

	blockedBy, err := s.queryDependencyItems(ctx, `
		SELECT t.id, t.title, t.status, t.priority, p.key
		FROM task_dependencies td
		JOIN tasks t ON t.id = td.depends_on_id
		JOIN projects p ON p.id = t.project_id
		WHERE td.task_id = $1
		ORDER BY t.title`, taskID)
	if err != nil {
		return nil, err
	}
	out.BlockedBy = blockedBy

	blocks, err := s.queryDependencyItems(ctx, `
		SELECT t.id, t.title, t.status, t.priority, p.key
		FROM task_dependencies td
		JOIN tasks t ON t.id = td.task_id
		JOIN projects p ON p.id = t.project_id
		WHERE td.depends_on_id = $1
		ORDER BY t.title`, taskID)
	if err != nil {
		return nil, err
	}
	out.Blocks = blocks

	return out, nil
}

func (s *TaskStore) queryDependencyItems(ctx context.Context, sql string, taskID uuid.UUID) ([]domain.TaskDependencyItem, error) {
	rows, err := s.pool.Query(ctx, sql, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []domain.TaskDependencyItem{}
	for rows.Next() {
		var it domain.TaskDependencyItem
		if err := rows.Scan(&it.ID, &it.Title, &it.Status, &it.Priority, &it.ProjectKey); err != nil {
			return nil, err
		}
		items = append(items, it)
	}
	return items, rows.Err()
}
