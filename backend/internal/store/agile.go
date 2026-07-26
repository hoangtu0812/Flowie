package store

import (
	"context"
	"time"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
)

// Burndown builds the day-by-day remaining-work series for a sprint.
//
// A task counts as finished on the day it reached "done" — taken from its last
// status_changed activity event, falling back to updated_at for tasks created
// directly in that status. Sprints without explicit dates fall back to the
// window spanned by their tasks so the chart still renders.
func (s *SprintStore) Burndown(ctx context.Context, sprintID uuid.UUID) (*domain.SprintBurndown, error) {
	sp, err := s.GetByID(ctx, sprintID)
	if err != nil {
		return nil, err
	}

	b := &domain.SprintBurndown{
		SprintID:  sp.ID,
		Name:      sp.Name,
		StartDate: sp.StartDate,
		EndDate:   sp.EndDate,
		Points:    []domain.BurndownPoint{},
	}

	// Task set: points + the moment each finished task reached done.
	type row struct {
		points float64
		doneAt *time.Time
	}
	rows, err := s.pool.Query(ctx, `
		SELECT COALESCE(t.story_points, 0),
		       CASE WHEN t.status = 'done' THEN COALESCE(
		           (SELECT max(a.created_at) FROM activity_events a
		             WHERE a.task_id = t.id AND a.verb = 'status_changed'
		               AND a.meta->>'to' = 'done'),
		           t.updated_at) END,
		       t.created_at
		FROM tasks t
		WHERE t.sprint_id = $1`, sprintID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []row
	var earliest, latest time.Time
	for rows.Next() {
		var r row
		var createdAt time.Time
		if err := rows.Scan(&r.points, &r.doneAt, &createdAt); err != nil {
			return nil, err
		}
		items = append(items, r)
		b.TotalPoints += r.points
		b.TotalTasks++
		if r.doneAt != nil {
			b.DonePoints += r.points
			b.DoneTasks++
		}
		if earliest.IsZero() || createdAt.Before(earliest) {
			earliest = createdAt
		}
		if r.doneAt != nil && r.doneAt.After(latest) {
			latest = *r.doneAt
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(items) == 0 {
		return b, nil
	}

	// Resolve the chart window.
	start := earliest
	if sp.StartDate != nil {
		start = *sp.StartDate
	}
	end := latest
	if sp.EndDate != nil {
		end = *sp.EndDate
	}
	if end.Before(start) || end.IsZero() {
		end = time.Now()
	}
	// Always show up to today for an in-flight sprint.
	if now := time.Now(); end.Before(now) && sp.State == domain.SprintActive {
		end = now
	}
	start = start.Truncate(24 * time.Hour)
	end = end.Truncate(24 * time.Hour)

	days := int(end.Sub(start).Hours()/24) + 1
	if days < 1 {
		days = 1
	}
	if days > 180 { // guard against absurd ranges
		days = 180
	}

	for i := 0; i < days; i++ {
		day := start.AddDate(0, 0, i)
		dayEnd := day.AddDate(0, 0, 1)

		remaining := 0.0
		remainingTasks := 0
		for _, it := range items {
			if it.doneAt == nil || !it.doneAt.Before(dayEnd) {
				remaining += it.points
				remainingTasks++
			}
		}
		ideal := b.TotalPoints
		if days > 1 {
			ideal = b.TotalPoints * (1 - float64(i)/float64(days-1))
		} else {
			ideal = 0
		}
		b.Points = append(b.Points, domain.BurndownPoint{
			Date:           day.Format("2006-01-02"),
			Remaining:      remaining,
			RemainingTasks: remainingTasks,
			Ideal:          ideal,
		})
	}
	return b, nil
}

// Velocity returns committed vs completed story points for a project's sprints.
func (s *SprintStore) Velocity(ctx context.Context, projectID uuid.UUID) ([]domain.VelocityPoint, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT sp.id, sp.name, sp.state,
		       COALESCE(SUM(COALESCE(t.story_points, 0)), 0),
		       COALESCE(SUM(CASE WHEN t.status = 'done' THEN COALESCE(t.story_points, 0) ELSE 0 END), 0),
		       count(t.id),
		       count(t.id) FILTER (WHERE t.status = 'done')
		FROM sprints sp
		LEFT JOIN tasks t ON t.sprint_id = sp.id
		WHERE sp.project_id = $1
		GROUP BY sp.id, sp.name, sp.state, sp.position
		ORDER BY sp.position`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.VelocityPoint{}
	for rows.Next() {
		var v domain.VelocityPoint
		if err := rows.Scan(&v.SprintID, &v.Name, &v.State, &v.Committed, &v.Completed,
			&v.CommittedTasks, &v.CompletedTasks); err != nil {
			return nil, err
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// Capacity summarises a sprint's load per assignee.
func (s *SprintStore) Capacity(ctx context.Context, sprintID uuid.UUID) (*domain.SprintCapacity, error) {
	c := &domain.SprintCapacity{SprintID: sprintID, ByAssignee: []domain.AssigneeCapacity{}}
	rows, err := s.pool.Query(ctx, `
		SELECT t.assignee_id, COALESCE(u.display_name, u.email::text, 'Chưa gán'),
		       COALESCE(SUM(COALESCE(t.story_points, 0)), 0),
		       count(*),
		       count(*) FILTER (WHERE t.status = 'done')
		FROM tasks t
		LEFT JOIN users u ON u.id = t.assignee_id
		WHERE t.sprint_id = $1
		GROUP BY t.assignee_id, u.display_name, u.email
		ORDER BY SUM(COALESCE(t.story_points, 0)) DESC`, sprintID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var a domain.AssigneeCapacity
		if err := rows.Scan(&a.UserID, &a.DisplayName, &a.Points, &a.Tasks, &a.DoneTasks); err != nil {
			return nil, err
		}
		c.ByAssignee = append(c.ByAssignee, a)
		c.TotalPoints += a.Points
		c.TotalTasks += a.Tasks
		c.DoneTasks += a.DoneTasks
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	err = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(CASE WHEN status='done' THEN COALESCE(story_points,0) ELSE 0 END), 0)
		FROM tasks WHERE sprint_id = $1`, sprintID).Scan(&c.DonePoints)
	if err != nil {
		return nil, err
	}
	return c, nil
}
