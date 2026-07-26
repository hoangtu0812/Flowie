package store

import (
	"context"
	"errors"
	"math"
	"time"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ErrTimerRunning is returned when a user starts a timer while another is live.
var ErrTimerRunning = errors.New("a timer is already running")

// StartTimer begins a stopwatch on a task. Only one timer per user may run at
// a time; starting another returns ErrTimerRunning.
func (s *WorklogStore) StartTimer(ctx context.Context, userID, taskID uuid.UUID, note string) (*domain.ActiveTimer, error) {
	tag, err := s.pool.Exec(ctx, `
		INSERT INTO active_timers (user_id, task_id, note)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO NOTHING`, userID, taskID, note)
	if err != nil {
		return nil, err
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrTimerRunning
	}
	return s.ActiveTimer(ctx, userID)
}

// ActiveTimer returns the user's running timer, or nil when none is running.
func (s *WorklogStore) ActiveTimer(ctx context.Context, userID uuid.UUID) (*domain.ActiveTimer, error) {
	var t domain.ActiveTimer
	err := s.pool.QueryRow(ctx, `
		SELECT a.user_id, a.task_id, t.title, p.id, p.key, a.note, a.started_at
		FROM active_timers a
		JOIN tasks t ON t.id = a.task_id
		JOIN projects p ON p.id = t.project_id
		WHERE a.user_id = $1`, userID).
		Scan(&t.UserID, &t.TaskID, &t.TaskTitle, &t.ProjectID, &t.ProjectKey, &t.Note, &t.StartedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	t.ElapsedSecs = int64(time.Since(t.StartedAt).Seconds())
	return &t, nil
}

// StopTimer ends the running timer and converts it into a worklog. Elapsed time
// is rounded to the nearest minute with a floor of 1, so very short sessions
// still record something. Returns ErrNotFound when no timer is running.
func (s *WorklogStore) StopTimer(ctx context.Context, userID uuid.UUID, note string) (*domain.Worklog, error) {
	var taskID uuid.UUID
	var startedAt time.Time
	var storedNote string
	err := s.pool.QueryRow(ctx, `
		DELETE FROM active_timers WHERE user_id = $1
		RETURNING task_id, started_at, note`, userID).
		Scan(&taskID, &startedAt, &storedNote)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	minutes := int(math.Round(time.Since(startedAt).Minutes()))
	if minutes < 1 {
		minutes = 1
	}
	if note == "" {
		note = storedNote
	}
	return s.Add(ctx, taskID, userID, minutes, note, "timer", time.Now())
}

// CancelTimer discards the running timer without logging any time.
func (s *WorklogStore) CancelTimer(ctx context.Context, userID uuid.UUID) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM active_timers WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
