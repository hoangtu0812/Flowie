package store

import (
	"context"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ChatStore handles persistence for project chat channels and messages.
type ChatStore struct {
	pool *pgxpool.Pool
}

// ListChannels returns a project's channels with the caller's unread count.
func (s *ChatStore) ListChannels(ctx context.Context, projectID, userID uuid.UUID) ([]domain.ChatChannel, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT c.id, c.project_id, c.name, c.created_at,
		       (SELECT count(*) FROM chat_messages m
		         WHERE m.channel_id = c.id
		           AND m.author_id IS DISTINCT FROM $2
		           AND m.created_at > COALESCE(
		               (SELECT r.last_read FROM chat_reads r
		                 WHERE r.channel_id = c.id AND r.user_id = $2),
		               'epoch'::timestamptz))
		FROM chat_channels c
		WHERE c.project_id = $1
		ORDER BY c.created_at`, projectID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.ChatChannel{}
	for rows.Next() {
		var c domain.ChatChannel
		if err := rows.Scan(&c.ID, &c.ProjectID, &c.Name, &c.CreatedAt, &c.Unread); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// CreateChannel adds a channel to a project.
func (s *ChatStore) CreateChannel(ctx context.Context, projectID uuid.UUID, name string) (*domain.ChatChannel, error) {
	var c domain.ChatChannel
	err := s.pool.QueryRow(ctx, `
		INSERT INTO chat_channels (project_id, name) VALUES ($1, $2)
		RETURNING id, project_id, name, created_at`, projectID, name).
		Scan(&c.ID, &c.ProjectID, &c.Name, &c.CreatedAt)
	return &c, err
}

// ChannelProject returns the project a channel belongs to, for access checks.
func (s *ChatStore) ChannelProject(ctx context.Context, channelID uuid.UUID) (uuid.UUID, error) {
	var projectID uuid.UUID
	err := s.pool.QueryRow(ctx,
		`SELECT project_id FROM chat_channels WHERE id = $1`, channelID).Scan(&projectID)
	if err != nil {
		return uuid.Nil, ErrNotFound
	}
	return projectID, nil
}

// DeleteChannel removes a channel and its messages (cascade).
func (s *ChatStore) DeleteChannel(ctx context.Context, channelID uuid.UUID) error {
	res, err := s.pool.Exec(ctx, `DELETE FROM chat_channels WHERE id = $1`, channelID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListMessages returns the most recent messages in a channel, oldest first.
// `before` (optional) pages backwards through history.
func (s *ChatStore) ListMessages(ctx context.Context, channelID uuid.UUID, limit int) ([]domain.ChatMessage, error) {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	rows, err := s.pool.Query(ctx, `
		SELECT m.id, m.channel_id, m.author_id,
		       COALESCE(u.display_name, ''), COALESCE(u.email::text, ''),
		       m.body, m.created_at
		FROM chat_messages m
		LEFT JOIN users u ON u.id = m.author_id
		WHERE m.channel_id = $1
		ORDER BY m.created_at DESC
		LIMIT $2`, channelID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Collected newest-first, then reversed so the UI renders chronologically.
	msgs := []domain.ChatMessage{}
	for rows.Next() {
		var m domain.ChatMessage
		if err := rows.Scan(&m.ID, &m.ChannelID, &m.AuthorID, &m.AuthorName,
			&m.AuthorEmail, &m.Body, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs, nil
}

// PostMessage appends a message and returns it with author details.
func (s *ChatStore) PostMessage(ctx context.Context, channelID, authorID uuid.UUID, body string) (*domain.ChatMessage, error) {
	var m domain.ChatMessage
	err := s.pool.QueryRow(ctx, `
		WITH ins AS (
		    INSERT INTO chat_messages (channel_id, author_id, body)
		    VALUES ($1, $2, $3)
		    RETURNING id, channel_id, author_id, body, created_at
		)
		SELECT ins.id, ins.channel_id, ins.author_id,
		       COALESCE(u.display_name, ''), COALESCE(u.email::text, ''),
		       ins.body, ins.created_at
		FROM ins LEFT JOIN users u ON u.id = ins.author_id`,
		channelID, authorID, body).
		Scan(&m.ID, &m.ChannelID, &m.AuthorID, &m.AuthorName, &m.AuthorEmail, &m.Body, &m.CreatedAt)
	return &m, err
}

// MarkRead records that the user has read a channel up to now.
func (s *ChatStore) MarkRead(ctx context.Context, channelID, userID uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO chat_reads (channel_id, user_id, last_read)
		VALUES ($1, $2, now())
		ON CONFLICT (channel_id, user_id) DO UPDATE SET last_read = now()`,
		channelID, userID)
	return err
}
