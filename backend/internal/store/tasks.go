package store

import (
	"context"
	"errors"
	"time"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TaskStore handles persistence for tasks.
type TaskStore struct {
	pool *pgxpool.Pool
}

const taskColumns = `id, project_id, parent_task_id, title, description, status, priority, assignee_id, reporter_id, participant_ids, story_points, start_date, due_date, position, sprint_id, start_at, end_at, created_at, updated_at`

func scanTask(row pgx.Row) (*domain.Task, error) {
	var t domain.Task
	err := row.Scan(&t.ID, &t.ProjectID, &t.ParentTaskID, &t.Title, &t.Description,
		&t.Status, &t.Priority, &t.AssigneeID, &t.ReporterID, &t.ParticipantIDs, &t.StoryPoints,
		&t.StartDate, &t.DueDate, &t.Position, &t.SprintID, &t.StartAt, &t.EndAt, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &t, nil
}

// CreateTaskParams carries inputs to create a task.
type CreateTaskParams struct {
	ProjectID    uuid.UUID
	ParentTaskID *uuid.UUID
	Title        string
	Description  string
	Status       string
	Priority       string
	AssigneeID     *uuid.UUID
	ReporterID     uuid.UUID
	ParticipantIDs []uuid.UUID
}

// Create inserts a task, placing it at the end of its status column.
func (s *TaskStore) Create(ctx context.Context, p CreateTaskParams) (*domain.Task, error) {
	if p.Status == "" {
		p.Status = "todo"
	}
	if p.Priority == "" {
		p.Priority = "medium"
	}

	var position int64
	err := s.pool.QueryRow(ctx, `SELECT COALESCE(MAX(position), 0) + 65536 FROM tasks WHERE project_id = $1 AND status = $2`, p.ProjectID, p.Status).Scan(&position)
	if err != nil {
		return nil, err
	}

	if p.ParticipantIDs == nil {
		p.ParticipantIDs = []uuid.UUID{}
	}

	row := s.pool.QueryRow(ctx, `
		INSERT INTO tasks (project_id, parent_task_id, title, description, status, priority, assignee_id, reporter_id, participant_ids, position)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING `+taskColumns,
		p.ProjectID, p.ParentTaskID, p.Title, p.Description, p.Status, p.Priority, p.AssigneeID, p.ReporterID, p.ParticipantIDs, position)
	return scanTask(row)
}

// GetByID fetches a task by id.
func (s *TaskStore) GetByID(ctx context.Context, id uuid.UUID) (*domain.Task, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+taskColumns+` FROM tasks WHERE id = $1`, id)
	return scanTask(row)
}

// Delete removes a task by id.
func (s *TaskStore) Delete(ctx context.Context, id uuid.UUID) error {
	res, err := s.pool.Exec(ctx, `DELETE FROM tasks WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListByProject returns tasks in a project ordered by status then position.
func (s *TaskStore) ListByProject(ctx context.Context, projectID uuid.UUID) ([]domain.Task, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+taskColumns+` FROM tasks
		WHERE project_id = $1 ORDER BY status, position`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []domain.Task
	for rows.Next() {
		t, err := scanTask(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *t)
	}
	return out, rows.Err()
}

// ListByProjectEnriched returns tasks with labels + aggregate counts for
// board/list rendering.
func (s *TaskStore) ListByProjectEnriched(ctx context.Context, projectID uuid.UUID) ([]domain.TaskListItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+prefixCols("t", taskColumns)+`,
		    (SELECT count(*) FROM comments c WHERE c.task_id = t.id) AS comment_count,
		    (SELECT count(*) FROM checklist_items ci WHERE ci.task_id = t.id) AS checklist_total,
		    (SELECT count(*) FROM checklist_items ci WHERE ci.task_id = t.id AND ci.done) AS checklist_done,
		    (SELECT count(*) FROM tasks st WHERE st.parent_task_id = t.id) AS subtask_count
		FROM tasks t
		WHERE t.project_id = $1 AND t.parent_task_id IS NULL
		ORDER BY t.status, t.position`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	items := make(map[uuid.UUID]*domain.TaskListItem)
	var order []uuid.UUID
	for rows.Next() {
		var t domain.Task
		var li domain.TaskListItem
		if err := rows.Scan(&t.ID, &t.ProjectID, &t.ParentTaskID, &t.Title, &t.Description,
			&t.Status, &t.Priority, &t.AssigneeID, &t.ReporterID, &t.ParticipantIDs, &t.StoryPoints,
			&t.StartDate, &t.DueDate, &t.Position, &t.SprintID, &t.StartAt, &t.EndAt, &t.CreatedAt, &t.UpdatedAt,
			&li.CommentCount, &li.ChecklistTotal, &li.ChecklistDone, &li.SubtaskCount); err != nil {
			return nil, err
		}
		li.Task = t
		li.Labels = []domain.Label{}
		items[t.ID] = &li
		order = append(order, t.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Attach labels in one query.
	lrows, err := s.pool.Query(ctx, `
		SELECT tl.task_id, l.id, l.project_id, l.name, l.color
		FROM task_labels tl
		JOIN labels l ON l.id = tl.label_id
		JOIN tasks t ON t.id = tl.task_id
		WHERE t.project_id = $1`, projectID)
	if err != nil {
		return nil, err
	}
	defer lrows.Close()
	for lrows.Next() {
		var taskID uuid.UUID
		var l domain.Label
		if err := lrows.Scan(&taskID, &l.ID, &l.ProjectID, &l.Name, &l.Color); err != nil {
			return nil, err
		}
		if it, ok := items[taskID]; ok {
			it.Labels = append(it.Labels, l)
		}
	}
	if err := lrows.Err(); err != nil {
		return nil, err
	}

	out := make([]domain.TaskListItem, 0, len(order))
	for _, id := range order {
		out = append(out, *items[id])
	}
	return out, nil
}

// CalendarForUser returns tasks (with a due date in range) across all projects
// in the workspaces the user belongs to.
func (s *TaskStore) CalendarForUser(ctx context.Context, userID uuid.UUID, from, to time.Time) ([]domain.CalendarItem, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT t.id, t.title, t.status, t.priority, t.start_date, t.due_date, t.start_at, t.end_at, t.assignee_id, t.participant_ids,
		       u.display_name, u.avatar_url,
		       p.id, p.key, p.name
		FROM tasks t
		JOIN projects p ON p.id = t.project_id
		JOIN workspace_members m ON m.workspace_id = p.workspace_id AND m.user_id = $1
		LEFT JOIN users u ON u.id = t.assignee_id
		WHERE (t.start_at >= $2 AND t.start_at < $3)
		   OR (t.start_at IS NULL AND t.due_date >= $2::date AND t.due_date <= $3::date)
		ORDER BY t.start_at NULLS LAST, t.due_date`, userID, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.CalendarItem{}
	for rows.Next() {
		var c domain.CalendarItem
		var pIds []uuid.UUID
		if err := rows.Scan(&c.ID, &c.Title, &c.Status, &c.Priority, &c.StartDate, &c.DueDate,
			&c.StartAt, &c.EndAt, &c.AssigneeID, &pIds, &c.AssigneeName, &c.AssigneeAvatar,
			&c.ProjectID, &c.ProjectKey, &c.ProjectName); err != nil {
			return nil, err
		}
		if pIds != nil {
			c.ParticipantIDs = pIds
		} else {
			c.ParticipantIDs = []uuid.UUID{}
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

// Update applies partial updates to a task's editable fields.
func (s *TaskStore) Update(ctx context.Context, id uuid.UUID, f TaskUpdateFields) (*domain.Task, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE tasks SET
		    title = COALESCE($2, title),
		    description = COALESCE($3, description),
		    priority = COALESCE($4, priority),
		    assignee_id = CASE WHEN $5 THEN $6 ELSE assignee_id END,
		    participant_ids = CASE WHEN $7 THEN $8 ELSE participant_ids END,
		    story_points = CASE WHEN $9 THEN $10 ELSE story_points END,
		    start_date = CASE WHEN $11 THEN $12 ELSE start_date END,
		    due_date = CASE WHEN $13 THEN $14 ELSE due_date END,
		    start_at = CASE WHEN $15 THEN $16 ELSE start_at END,
		    end_at = CASE WHEN $17 THEN $18 ELSE end_at END,
		    reporter_id = CASE WHEN $19 THEN $20 ELSE reporter_id END
		WHERE id = $1
		RETURNING `+taskColumns,
		id, f.Title, f.Description, f.Priority,
		f.SetAssignee, f.AssigneeID,
		f.SetParticipants, f.ParticipantIDs,
		f.SetStoryPoints, f.StoryPoints,
		f.SetStartDate, f.StartDate,
		f.SetDueDate, f.DueDate,
		f.SetStartAt, f.StartAt,
		f.SetEndAt, f.EndAt,
		f.SetReporter, f.ReporterID)
	return scanTask(row)
}

// TaskUpdateFields carries optional task edits. Pointer = "set if non-nil";
// the Set* booleans allow explicitly clearing nullable fields to NULL.
type TaskUpdateFields struct {
	Title       *string
	Description *string
	Priority    *string

	SetAssignee bool
	AssigneeID  *uuid.UUID

	SetParticipants bool
	ParticipantIDs  []uuid.UUID

	SetStoryPoints bool
	StoryPoints    *float64

	SetStartDate bool
	StartDate    *time.Time

	SetDueDate bool
	DueDate    *time.Time

	SetStartAt bool
	StartAt    *time.Time

	SetEndAt bool
	EndAt    *time.Time

	SetReporter bool
	ReporterID  *uuid.UUID
}

// UpdateStatus moves a task to a new status column (used by Kanban drag/drop).
func (s *TaskStore) UpdateStatus(ctx context.Context, id uuid.UUID, status string) (*domain.Task, error) {
	row := s.pool.QueryRow(ctx, `
		UPDATE tasks SET status = $2,
		    position = COALESCE((SELECT MAX(position) + 1 FROM tasks t2 WHERE t2.project_id = tasks.project_id AND t2.status = $2), 0)
		WHERE id = $1
		RETURNING `+taskColumns, id, status)
	return scanTask(row)
}
