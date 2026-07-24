package store

import (
	"context"
	"errors"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SprintStore handles persistence for sprints.
type SprintStore struct {
	pool *pgxpool.Pool
}

const sprintColumns = `id, project_id, name, goal, state, start_date, end_date, position, created_at, updated_at`

func scanSprint(row pgx.Row) (*domain.Sprint, error) {
	var s domain.Sprint
	err := row.Scan(&s.ID, &s.ProjectID, &s.Name, &s.Goal, &s.State,
		&s.StartDate, &s.EndDate, &s.Position, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}

// Create inserts a sprint at the end of the project's sprint order.
func (s *SprintStore) Create(ctx context.Context, projectID uuid.UUID, name, goal string) (*domain.Sprint, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO sprints (project_id, name, goal, position)
		VALUES ($1, $2, $3, COALESCE((SELECT MAX(position)+1 FROM sprints WHERE project_id=$1), 0))
		RETURNING `+sprintColumns, projectID, name, goal)
	return scanSprint(row)
}

// ListByProject returns a project's sprints ordered by position.
func (s *SprintStore) ListByProject(ctx context.Context, projectID uuid.UUID) ([]domain.Sprint, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+sprintColumns+` FROM sprints WHERE project_id=$1 ORDER BY position`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Sprint{}
	for rows.Next() {
		sp, err := scanSprint(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *sp)
	}
	return out, rows.Err()
}

// GetByID fetches a sprint by id.
func (s *SprintStore) GetByID(ctx context.Context, id uuid.UUID) (*domain.Sprint, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+sprintColumns+` FROM sprints WHERE id=$1`, id)
	return scanSprint(row)
}

// UpdateFields carries optional sprint edits.
type SprintUpdateFields struct {
	Name  *string
	Goal  *string
	State *string
}

// Update patches a sprint's editable fields.
func (s *SprintStore) Update(ctx context.Context, id uuid.UUID, f SprintUpdateFields) (*domain.Sprint, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE sprints SET
		    name = COALESCE($2, name),
		    goal = COALESCE($3, goal),
		    state = COALESCE($4::sprint_state, state)
		WHERE id = $1
		RETURNING `+sprintColumns, id, f.Name, f.Goal, f.State)
	return scanSprint(row)
}
