package store

import (
	"context"
	"encoding/json"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// IntegrationStore persists Slack/Teams incoming-webhook integrations.
type IntegrationStore struct {
	pool *pgxpool.Pool
}

const integrationColumns = `id, project_id, provider, webhook_url, events, active, last_status, last_error, created_at`

func scanIntegration(row interface{ Scan(...any) error }) (*domain.Integration, error) {
	var in domain.Integration
	var events []byte
	if err := row.Scan(&in.ID, &in.ProjectID, &in.Provider, &in.WebhookURL, &events,
		&in.Active, &in.LastStatus, &in.LastError, &in.CreatedAt); err != nil {
		return nil, err
	}
	in.Events = []string{}
	if len(events) > 0 {
		_ = json.Unmarshal(events, &in.Events)
	}
	return &in, nil
}

// ListByProject returns a project's integrations.
func (s *IntegrationStore) ListByProject(ctx context.Context, projectID uuid.UUID) ([]domain.Integration, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+integrationColumns+` FROM integrations WHERE project_id=$1 ORDER BY created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Integration{}
	for rows.Next() {
		in, err := scanIntegration(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *in)
	}
	return out, rows.Err()
}

// ActiveForEvent returns integrations that want a given event type.
func (s *IntegrationStore) ActiveForEvent(ctx context.Context, projectID uuid.UUID, eventType string) ([]domain.Integration, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+integrationColumns+` FROM integrations
		WHERE project_id=$1 AND active
		  AND (events = '[]'::jsonb OR events @> to_jsonb($2::text))`, projectID, eventType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Integration{}
	for rows.Next() {
		in, err := scanIntegration(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *in)
	}
	return out, rows.Err()
}

// Create registers an integration.
func (s *IntegrationStore) Create(ctx context.Context, projectID uuid.UUID, provider, url string, events []string) (*domain.Integration, error) {
	if events == nil {
		events = []string{}
	}
	raw, _ := json.Marshal(events)
	row := s.pool.QueryRow(ctx, `
		INSERT INTO integrations (project_id, provider, webhook_url, events)
		VALUES ($1,$2,$3,$4)
		RETURNING `+integrationColumns, projectID, provider, url, raw)
	return scanIntegration(row)
}

// Delete removes an integration scoped to its project.
func (s *IntegrationStore) Delete(ctx context.Context, projectID, id uuid.UUID) error {
	res, err := s.pool.Exec(ctx, `DELETE FROM integrations WHERE id=$1 AND project_id=$2`, id, projectID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// RecordDelivery stores the outcome of the last post.
func (s *IntegrationStore) RecordDelivery(ctx context.Context, id uuid.UUID, status int, errMsg string) {
	var errPtr *string
	if errMsg != "" {
		errPtr = &errMsg
	}
	_, _ = s.pool.Exec(ctx,
		`UPDATE integrations SET last_status=$2, last_error=$3 WHERE id=$1`, id, status, errPtr)
}
