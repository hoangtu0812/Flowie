package store

import (
	"context"
	"time"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WorklogStore handles persistence for time entries.
type WorklogStore struct {
	pool *pgxpool.Pool
}

// Add inserts a worklog entry.
func (s *WorklogStore) Add(ctx context.Context, taskID, userID uuid.UUID, minutes int, note, source string, loggedOn time.Time) (*domain.Worklog, error) {
	var wlg domain.Worklog
	err := s.pool.QueryRow(ctx, `
		INSERT INTO worklogs (task_id, user_id, minutes, note, source, logged_on)
		VALUES ($1,$2,$3,$4,$5,$6)
		RETURNING id, task_id, user_id, minutes, note, logged_on, source, state, created_at`,
		taskID, userID, minutes, note, source, loggedOn).
		Scan(&wlg.ID, &wlg.TaskID, &wlg.UserID, &wlg.Minutes, &wlg.Note, &wlg.LoggedOn, &wlg.Source, &wlg.State, &wlg.CreatedAt)
	return &wlg, err
}

// ListByTask returns worklogs on a task, newest-first.
func (s *WorklogStore) ListByTask(ctx context.Context, taskID uuid.UUID) ([]domain.Worklog, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, task_id, user_id, minutes, note, logged_on, source, state, created_at
		FROM worklogs WHERE task_id=$1 ORDER BY logged_on DESC, created_at DESC`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Worklog{}
	for rows.Next() {
		var wlg domain.Worklog
		if err := rows.Scan(&wlg.ID, &wlg.TaskID, &wlg.UserID, &wlg.Minutes, &wlg.Note, &wlg.LoggedOn, &wlg.Source, &wlg.State, &wlg.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, wlg)
	}
	return out, rows.Err()
}

// TimesheetForUser returns a user's worklogs in a date range with task/project
// context (for the timesheet grid).
func (s *WorklogStore) TimesheetForUser(ctx context.Context, userID uuid.UUID, from, to time.Time) ([]domain.TimesheetEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT w.id, w.task_id, w.user_id, w.minutes, w.note, w.logged_on, w.source, w.state, w.created_at,
		       t.title, p.id, p.name, p.key, u.display_name, u.email
		FROM worklogs w
		JOIN tasks t ON t.id = w.task_id
		JOIN projects p ON p.id = t.project_id
		LEFT JOIN users u ON u.id = w.user_id
		WHERE w.user_id=$1 AND w.logged_on BETWEEN $2 AND $3
		ORDER BY w.logged_on`, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.TimesheetEntry{}
	for rows.Next() {
		var e domain.TimesheetEntry
		var dname, email *string
		if err := rows.Scan(&e.ID, &e.TaskID, &e.UserID, &e.Minutes, &e.Note, &e.LoggedOn, &e.Source, &e.State, &e.CreatedAt,
			&e.TaskTitle, &e.ProjectID, &e.ProjectName, &e.ProjectKey, &dname, &email); err != nil {
			return nil, err
		}
		if dname != nil { e.UserDisplayName = *dname }
		if email != nil { e.UserEmail = *email }
		out = append(out, e)
	}
	return out, rows.Err()
}

// TimesheetForProject returns all worklogs for a project in a date range.
func (s *WorklogStore) TimesheetForProject(ctx context.Context, projectID uuid.UUID, from, to time.Time) ([]domain.TimesheetEntry, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT w.id, w.task_id, w.user_id, w.minutes, w.note, w.logged_on, w.source, w.state, w.created_at,
		       t.title, p.id, p.name, p.key, u.display_name, u.email
		FROM worklogs w
		JOIN tasks t ON t.id = w.task_id
		JOIN projects p ON p.id = t.project_id
		LEFT JOIN users u ON u.id = w.user_id
		WHERE p.id=$1 AND w.logged_on BETWEEN $2 AND $3
		ORDER BY w.user_id, w.logged_on`, projectID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.TimesheetEntry{}
	for rows.Next() {
		var e domain.TimesheetEntry
		var dname, email *string
		if err := rows.Scan(&e.ID, &e.TaskID, &e.UserID, &e.Minutes, &e.Note, &e.LoggedOn, &e.Source, &e.State, &e.CreatedAt,
			&e.TaskTitle, &e.ProjectID, &e.ProjectName, &e.ProjectKey, &dname, &email); err != nil {
			return nil, err
		}
		if dname != nil { e.UserDisplayName = *dname }
		if email != nil { e.UserEmail = *email }
		out = append(out, e)
	}
	return out, rows.Err()
}

// SubmitRange transitions a user's draft worklogs in a range to submitted.
func (s *WorklogStore) SubmitRange(ctx context.Context, userID uuid.UUID, from, to time.Time) (int64, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE worklogs SET state='submitted'
		WHERE user_id=$1 AND logged_on BETWEEN $2 AND $3 AND state='draft'`, userID, from, to)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

// GetByID returns a single worklog.
func (s *WorklogStore) GetByID(ctx context.Context, id uuid.UUID) (*domain.Worklog, error) {
	var wlg domain.Worklog
	err := s.pool.QueryRow(ctx, `
		SELECT id, task_id, user_id, minutes, note, logged_on, source, state, created_at
		FROM worklogs WHERE id=$1`, id).
		Scan(&wlg.ID, &wlg.TaskID, &wlg.UserID, &wlg.Minutes, &wlg.Note, &wlg.LoggedOn, &wlg.Source, &wlg.State, &wlg.CreatedAt)
	if err != nil {
		return nil, ErrNotFound
	}
	return &wlg, nil
}

// SetState updates a worklog's approval state.
func (s *WorklogStore) SetState(ctx context.Context, id uuid.UUID, state string) error {
	_, err := s.pool.Exec(ctx, `UPDATE worklogs SET state=$2::worklog_state WHERE id=$1`, id, state)
	return err
}
