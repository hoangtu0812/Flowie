package store

import (
	"context"
	"encoding/json"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
)

// ── Labels ───────────────────────────────────────────────────

// ListLabels returns all labels defined in a project.
func (s *TaskStore) ListLabels(ctx context.Context, projectID uuid.UUID) ([]domain.Label, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, project_id, name, color FROM labels WHERE project_id = $1 ORDER BY name`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Label{}
	for rows.Next() {
		var l domain.Label
		if err := rows.Scan(&l.ID, &l.ProjectID, &l.Name, &l.Color); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// CreateLabel adds a label to a project.
func (s *TaskStore) CreateLabel(ctx context.Context, projectID uuid.UUID, name, color string) (*domain.Label, error) {
	var l domain.Label
	err := s.pool.QueryRow(ctx,
		`INSERT INTO labels (project_id, name, color) VALUES ($1,$2,$3)
		 RETURNING id, project_id, name, color`, projectID, name, color).
		Scan(&l.ID, &l.ProjectID, &l.Name, &l.Color)
	return &l, err
}

// SetTaskLabel adds/removes a label on a task.
func (s *TaskStore) SetTaskLabel(ctx context.Context, taskID, labelID uuid.UUID, on bool) error {
	if on {
		_, err := s.pool.Exec(ctx,
			`INSERT INTO task_labels (task_id, label_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
			taskID, labelID)
		return err
	}
	_, err := s.pool.Exec(ctx, `DELETE FROM task_labels WHERE task_id=$1 AND label_id=$2`, taskID, labelID)
	return err
}

// ── Comments ─────────────────────────────────────────────────

// AddComment inserts a comment and returns it with author info.
func (s *TaskStore) AddComment(ctx context.Context, taskID, authorID uuid.UUID, body string) (*domain.Comment, error) {
	var c domain.Comment
	err := s.pool.QueryRow(ctx, `
		WITH ins AS (
		    INSERT INTO comments (task_id, author_id, body) VALUES ($1,$2,$3)
		    RETURNING id, task_id, author_id, body, created_at
		)
		SELECT ins.id, ins.task_id, ins.author_id, COALESCE(u.display_name,''), COALESCE(u.email::text,''), ins.body, ins.created_at
		FROM ins LEFT JOIN users u ON u.id = ins.author_id`,
		taskID, authorID, body).
		Scan(&c.ID, &c.TaskID, &c.AuthorID, &c.AuthorName, &c.AuthorEmail, &c.Body, &c.CreatedAt)
	return &c, err
}

// ListComments returns a task's comments oldest-first.
func (s *TaskStore) ListComments(ctx context.Context, taskID uuid.UUID) ([]domain.Comment, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT c.id, c.task_id, c.author_id, COALESCE(u.display_name,''), COALESCE(u.email::text,''), c.body, c.created_at
		FROM comments c LEFT JOIN users u ON u.id = c.author_id
		WHERE c.task_id = $1 ORDER BY c.created_at`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Comment{}
	for rows.Next() {
		var c domain.Comment
		if err := rows.Scan(&c.ID, &c.TaskID, &c.AuthorID, &c.AuthorName, &c.AuthorEmail, &c.Body, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// ── Checklist ────────────────────────────────────────────────

// ListChecklist returns a task's checklist items ordered by position.
func (s *TaskStore) ListChecklist(ctx context.Context, taskID uuid.UUID) ([]domain.ChecklistItem, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, task_id, title, done, position, created_at FROM checklist_items
		 WHERE task_id=$1 ORDER BY position`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.ChecklistItem{}
	for rows.Next() {
		var c domain.ChecklistItem
		if err := rows.Scan(&c.ID, &c.TaskID, &c.Title, &c.Done, &c.Position, &c.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// AddChecklistItem appends an item to a task's checklist.
func (s *TaskStore) AddChecklistItem(ctx context.Context, taskID uuid.UUID, title string) (*domain.ChecklistItem, error) {
	var c domain.ChecklistItem
	err := s.pool.QueryRow(ctx, `
		INSERT INTO checklist_items (task_id, title, position)
		VALUES ($1, $2, COALESCE((SELECT MAX(position)+1 FROM checklist_items WHERE task_id=$1), 0))
		RETURNING id, task_id, title, done, position, created_at`, taskID, title).
		Scan(&c.ID, &c.TaskID, &c.Title, &c.Done, &c.Position, &c.CreatedAt)
	return &c, err
}

// ToggleChecklistItem flips an item's done state.
func (s *TaskStore) ToggleChecklistItem(ctx context.Context, itemID uuid.UUID, done bool) error {
	_, err := s.pool.Exec(ctx, `UPDATE checklist_items SET done=$2 WHERE id=$1`, itemID, done)
	return err
}

// SetSprint assigns a task to a sprint (nil = move to backlog).
func (s *TaskStore) SetSprint(ctx context.Context, taskID uuid.UUID, sprintID *uuid.UUID) error {
	_, err := s.pool.Exec(ctx, `UPDATE tasks SET sprint_id=$2 WHERE id=$1`, taskID, sprintID)
	return err
}

// ── Activity ─────────────────────────────────────────────────

// RecordActivity appends an audit event for a task.
func (s *TaskStore) RecordActivity(ctx context.Context, taskID uuid.UUID, actorID uuid.UUID, verb string, meta map[string]any) error {
	raw, _ := json.Marshal(meta)
	_, err := s.pool.Exec(ctx,
		`INSERT INTO activity_events (task_id, actor_id, verb, meta) VALUES ($1,$2,$3,$4)`,
		taskID, actorID, verb, raw)
	return err
}

// ListActivity returns a task's activity newest-first.
func (s *TaskStore) ListActivity(ctx context.Context, taskID uuid.UUID) ([]domain.ActivityEvent, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT a.id, a.task_id, a.actor_id, COALESCE(u.display_name,''), a.verb, a.meta, a.created_at
		FROM activity_events a LEFT JOIN users u ON u.id = a.actor_id
		WHERE a.task_id=$1 ORDER BY a.created_at DESC`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.ActivityEvent{}
	for rows.Next() {
		var a domain.ActivityEvent
		if err := rows.Scan(&a.ID, &a.TaskID, &a.ActorID, &a.ActorName, &a.Verb, &a.Meta, &a.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}
