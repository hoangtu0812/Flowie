package store

import (
	"context"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ReportStore persists scheduled report definitions.
type ReportStore struct {
	pool *pgxpool.Pool
}

const reportColumns = `id, workspace_id, project_id, name, frequency, channel_url, provider, hour_utc, active, last_run_at, last_status, last_error, created_at`

func scanReport(row interface{ Scan(...any) error }) (*domain.ScheduledReport, error) {
	var r domain.ScheduledReport
	if err := row.Scan(&r.ID, &r.WorkspaceID, &r.ProjectID, &r.Name, &r.Frequency,
		&r.ChannelURL, &r.Provider, &r.HourUTC, &r.Active, &r.LastRunAt,
		&r.LastStatus, &r.LastError, &r.CreatedAt); err != nil {
		return nil, err
	}
	return &r, nil
}

// ListByWorkspace returns a workspace's scheduled reports.
func (s *ReportStore) ListByWorkspace(ctx context.Context, workspaceID uuid.UUID) ([]domain.ScheduledReport, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+reportColumns+` FROM scheduled_reports WHERE workspace_id=$1 ORDER BY created_at`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.ScheduledReport{}
	for rows.Next() {
		r, err := scanReport(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

// Create adds a scheduled report.
func (s *ReportStore) Create(ctx context.Context, workspaceID uuid.UUID, projectID *uuid.UUID, name, frequency, channelURL, provider string, hourUTC int) (*domain.ScheduledReport, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO scheduled_reports (workspace_id, project_id, name, frequency, channel_url, provider, hour_utc)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING `+reportColumns,
		workspaceID, projectID, name, frequency, channelURL, provider, hourUTC)
	return scanReport(row)
}

// Delete removes a report scoped to its workspace.
func (s *ReportStore) Delete(ctx context.Context, workspaceID, id uuid.UUID) error {
	res, err := s.pool.Exec(ctx,
		`DELETE FROM scheduled_reports WHERE id=$1 AND workspace_id=$2`, id, workspaceID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DueNow returns active reports whose send hour matches and that have not
// already run within their period.
//
// The "already ran" guard is what makes the scheduler safe to run every few
// minutes and safe against a restart: a daily report only fires once per day,
// a weekly one once per 7 days.
func (s *ReportStore) DueNow(ctx context.Context, hourUTC int) ([]domain.ScheduledReport, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+reportColumns+` FROM scheduled_reports
		WHERE active AND hour_utc = $1
		  AND (
		    last_run_at IS NULL
		    OR (frequency = 'daily'  AND last_run_at < now() - interval '20 hours')
		    OR (frequency = 'weekly' AND last_run_at < now() - interval '6 days')
		  )`, hourUTC)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.ScheduledReport{}
	for rows.Next() {
		r, err := scanReport(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *r)
	}
	return out, rows.Err()
}

// MarkRun records the outcome of a delivery attempt.
func (s *ReportStore) MarkRun(ctx context.Context, id uuid.UUID, status int, errMsg string) {
	var errPtr *string
	if errMsg != "" {
		errPtr = &errMsg
	}
	_, _ = s.pool.Exec(ctx, `
		UPDATE scheduled_reports SET last_run_at = now(), last_status = $2, last_error = $3
		WHERE id = $1`, id, status, errPtr)
}
