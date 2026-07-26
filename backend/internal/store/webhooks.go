package store

import (
	"context"
	"encoding/json"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// WebhookStore handles persistence for outgoing webhooks.
type WebhookStore struct {
	pool *pgxpool.Pool
}

const webhookColumns = `id, project_id, url, events, secret, active, last_status, last_error, last_sent_at, created_at`

func scanWebhook(row interface{ Scan(...any) error }) (*domain.Webhook, error) {
	var wh domain.Webhook
	var events []byte
	if err := row.Scan(&wh.ID, &wh.ProjectID, &wh.URL, &events, &wh.Secret, &wh.Active,
		&wh.LastStatus, &wh.LastError, &wh.LastSentAt, &wh.CreatedAt); err != nil {
		return nil, err
	}
	wh.Events = []string{}
	if len(events) > 0 {
		_ = json.Unmarshal(events, &wh.Events)
	}
	wh.HasSecret = wh.Secret != ""
	return &wh, nil
}

// ListByProject returns a project's webhooks.
func (s *WebhookStore) ListByProject(ctx context.Context, projectID uuid.UUID) ([]domain.Webhook, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+webhookColumns+` FROM webhooks WHERE project_id=$1 ORDER BY created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Webhook{}
	for rows.Next() {
		wh, err := scanWebhook(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *wh)
	}
	return out, rows.Err()
}

// ActiveForEvent returns webhooks that should receive a given event type.
func (s *WebhookStore) ActiveForEvent(ctx context.Context, projectID uuid.UUID, eventType string) ([]domain.Webhook, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+webhookColumns+` FROM webhooks
		WHERE project_id = $1 AND active
		  AND (events = '[]'::jsonb OR events @> to_jsonb($2::text))`, projectID, eventType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Webhook{}
	for rows.Next() {
		wh, err := scanWebhook(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *wh)
	}
	return out, rows.Err()
}

// Create registers a webhook.
func (s *WebhookStore) Create(ctx context.Context, projectID uuid.UUID, url string, events []string, secret string) (*domain.Webhook, error) {
	if events == nil {
		events = []string{}
	}
	raw, _ := json.Marshal(events)
	row := s.pool.QueryRow(ctx, `
		INSERT INTO webhooks (project_id, url, events, secret)
		VALUES ($1,$2,$3,$4)
		RETURNING `+webhookColumns, projectID, url, raw, secret)
	return scanWebhook(row)
}

// Delete removes a webhook scoped to its project.
func (s *WebhookStore) Delete(ctx context.Context, projectID, id uuid.UUID) error {
	res, err := s.pool.Exec(ctx, `DELETE FROM webhooks WHERE id=$1 AND project_id=$2`, id, projectID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// RecordDelivery stores the outcome of the last delivery attempt.
func (s *WebhookStore) RecordDelivery(ctx context.Context, id uuid.UUID, status int, errMsg string) {
	var errPtr *string
	if errMsg != "" {
		errPtr = &errMsg
	}
	_, _ = s.pool.Exec(ctx, `
		UPDATE webhooks SET last_status=$2, last_error=$3, last_sent_at=now() WHERE id=$1`,
		id, status, errPtr)
}
