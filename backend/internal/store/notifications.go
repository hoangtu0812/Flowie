package store

import (
	"context"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// NotificationStore handles persistence for in-app notifications.
type NotificationStore struct {
	pool *pgxpool.Pool
}

// Create inserts a notification for a user.
//
// `link` is the frontend path to open when the notification is clicked. It is
// computed at write time because the notification list must not need a lookup
// per row just to become clickable.
func (s *NotificationStore) Create(ctx context.Context, userID uuid.UUID, ntype, title, body string, taskID *uuid.UUID, link string) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO notifications (user_id, type, title, body, task_id, link)
		VALUES ($1,$2,$3,$4,$5,$6)`, userID, ntype, title, body, taskID, link)
	return err
}

// ListForUser returns a user's notifications (newest first) + unread count.
func (s *NotificationStore) ListForUser(ctx context.Context, userID uuid.UUID, limit int) ([]domain.Notification, int, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, user_id, type, title, body, task_id, link, read_at, created_at
		FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, userID, limit)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := []domain.Notification{}
	for rows.Next() {
		var n domain.Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.Type, &n.Title, &n.Body, &n.TaskID, &n.Link, &n.ReadAt, &n.CreatedAt); err != nil {
			return nil, 0, err
		}
		out = append(out, n)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	var unread int
	if err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM notifications WHERE user_id=$1 AND read_at IS NULL`, userID).Scan(&unread); err != nil {
		return nil, 0, err
	}
	return out, unread, nil
}

// MarkAllRead marks all of a user's notifications as read.
func (s *NotificationStore) MarkAllRead(ctx context.Context, userID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL`, userID)
	return err
}

// MarkRead marks a single notification read (scoped to the owner).
func (s *NotificationStore) MarkRead(ctx context.Context, userID, id uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2`, id, userID)
	return err
}
