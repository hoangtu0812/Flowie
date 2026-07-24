package store

import (
	"context"
	"errors"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TaskStore handles persistence for tasks.
type TaskStore struct {
	pool *pgxpool.Pool
}

const taskColumns = `id, project_id, parent_task_id, title, description, status, priority, assignee_id, reporter_id, story_points, start_date, due_date, position, created_at, updated_at`

func scanTask(row pgx.Row) (*domain.Task, error) {
	var t domain.Task
	err := row.Scan(&t.ID, &t.ProjectID, &t.ParentTaskID, &t.Title, &t.Description,
		&t.Status, &t.Priority, &t.AssigneeID, &t.ReporterID, &t.StoryPoints,
		&t.StartDate, &t.DueDate, &t.Position, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

// CreateTaskParams carries inputs to create a task.
type CreateTaskParams struct {
	ProjectID    uuid.UUID
	ParentTaskID *uuid.UUID
	Title        string
	Description  string
	Status       string
	Priority     string
	AssigneeID   *uuid.UUID
	ReporterID   uuid.UUID
}

// Create inserts a task, placing it at the end of its status column.
func (s *TaskStore) Create(ctx context.Context, p CreateTaskParams) (*domain.Task, error) {
	if p.Status == "" {
		p.Status = "todo"
	}
	if p.Priority == "" {
		p.Priority = "medium"
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO tasks (project_id, parent_task_id, title, description, status, priority, assignee_id, reporter_id, position)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
		        COALESCE((SELECT MAX(position) + 1 FROM tasks WHERE project_id = $1 AND status = $5), 0))
		RETURNING `+taskColumns,
		p.ProjectID, p.ParentTaskID, p.Title, p.Description, p.Status, p.Priority, p.AssigneeID, p.ReporterID)
	return scanTask(row)
}

// GetByID fetches a task by id.
func (s *TaskStore) GetByID(ctx context.Context, id uuid.UUID) (*domain.Task, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+taskColumns+` FROM tasks WHERE id = $1`, id)
	return scanTask(row)
}

// ListByProject returns tasks in a project ordered by status then position.
func (s *TaskStore) ListByProject(ctx context.Context, projectID uuid.UUID) ([]domain.Task, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+taskColumns+` FROM tasks
		WHERE project_id = $1 ORDER BY status, position`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Task
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

// UpdateStatus moves a task to a new status column (used by Kanban drag/drop).
func (s *TaskStore) UpdateStatus(ctx context.Context, id uuid.UUID, status string) (*domain.Task, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE tasks SET status = $2,
		    position = COALESCE((SELECT MAX(position) + 1 FROM tasks t2 WHERE t2.project_id = tasks.project_id AND t2.status = $2), 0)
		WHERE id = $1
		RETURNING `+taskColumns, id, status)
	return scanTask(row)
}
