package store

import (
	"context"
	"strconv"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
)

// ByProjectNumber finds a task by its human-readable number within a project
// (the "12" in "SAP-12").
func (s *TaskStore) ByProjectNumber(ctx context.Context, projectID uuid.UUID, number string) (*domain.Task, error) {
	n, err := strconv.Atoi(number)
	if err != nil {
		return nil, ErrNotFound
	}
	row := s.pool.QueryRow(ctx,
		`SELECT `+taskColumns+` FROM tasks WHERE project_id = $1 AND number = $2`, projectID, n)
	return scanTask(row)
}

// AddSystemComment posts a comment with no author, used for machine-generated
// notes such as linked commits and pull requests.
func (s *TaskStore) AddSystemComment(ctx context.Context, taskID uuid.UUID, body string) (*domain.Comment, error) {
	var c domain.Comment
	err := s.pool.QueryRow(ctx, `
		INSERT INTO comments (task_id, author_id, body)
		VALUES ($1, NULL, $2)
		RETURNING id, task_id, author_id, body, created_at`, taskID, body).
		Scan(&c.ID, &c.TaskID, &c.AuthorID, &c.Body, &c.CreatedAt)
	if err != nil {
		return nil, err
	}
	c.AuthorName = "Flowie Bot"
	return &c, nil
}
