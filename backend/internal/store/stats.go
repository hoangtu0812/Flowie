package store

import (
	"context"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
)

// ProjectStats aggregates a project's task metrics for analytics.
func (s *TaskStore) ProjectStats(ctx context.Context, projectID uuid.UUID) (*domain.ProjectStats, error) {
	stats := &domain.ProjectStats{
		ByStatus:   map[string]int{},
		ByPriority: map[string]int{},
	}

	// Counts + story points by status.
	rows, err := s.pool.Query(ctx, `
		SELECT status, count(*), COALESCE(SUM(story_points),0)
		FROM tasks WHERE project_id=$1 GROUP BY status`, projectID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var status string
		var cnt int
		var pts float64
		if err := rows.Scan(&status, &cnt, &pts); err != nil {
			rows.Close()
			return nil, err
		}
		stats.ByStatus[status] = cnt
		stats.Total += cnt
		stats.StoryPointsTotal += pts
		if status == "done" {
			stats.Done += cnt
			stats.StoryPointsDone += pts
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Counts by priority.
	prows, err := s.pool.Query(ctx, `
		SELECT priority, count(*) FROM tasks WHERE project_id=$1 GROUP BY priority`, projectID)
	if err != nil {
		return nil, err
	}
	for prows.Next() {
		var pr string
		var cnt int
		if err := prows.Scan(&pr, &cnt); err != nil {
			prows.Close()
			return nil, err
		}
		stats.ByPriority[pr] = cnt
	}
	prows.Close()
	if err := prows.Err(); err != nil {
		return nil, err
	}

	// Hours logged + actual cost (worklog minutes × hourly rate).
	err = s.pool.QueryRow(ctx, `
		SELECT COALESCE(SUM(w.minutes),0)/60.0,
		       COALESCE(SUM(w.minutes/60.0 * COALESCE(r.hourly_rate,0)),0)
		FROM worklogs w
		JOIN tasks t ON t.id = w.task_id
		LEFT JOIN user_rates r ON r.user_id = w.user_id
		WHERE t.project_id=$1`, projectID).
		Scan(&stats.HoursLogged, &stats.CostActual)
	if err != nil {
		return nil, err
	}
	return stats, nil
}

// DashboardStats aggregates a user's cross-workspace metrics.
func (s *TaskStore) DashboardStats(ctx context.Context, userID uuid.UUID) (*domain.DashboardStats, error) {
	d := &domain.DashboardStats{}
	err := s.pool.QueryRow(ctx, `
		SELECT
		  (SELECT count(*) FROM workspace_members WHERE user_id=$1),
		  (SELECT count(*) FROM projects p JOIN workspace_members m ON m.workspace_id=p.workspace_id WHERE m.user_id=$1),
		  (SELECT count(*) FROM tasks t JOIN projects p ON p.id=t.project_id JOIN workspace_members m ON m.workspace_id=p.workspace_id
		     WHERE m.user_id=$1 AND t.status <> 'done'),
		  (SELECT count(*) FROM tasks t JOIN projects p ON p.id=t.project_id JOIN workspace_members m ON m.workspace_id=p.workspace_id
		     WHERE m.user_id=$1 AND t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date <= CURRENT_DATE + 7),
		  (SELECT COALESCE(SUM(minutes),0)/60.0 FROM worklogs WHERE user_id=$1 AND logged_on >= date_trunc('week', CURRENT_DATE))
	`, userID).Scan(&d.WorkspaceCount, &d.ProjectCount, &d.OpenTasks, &d.DueSoon, &d.HoursThisWeek)
	if err != nil {
		return nil, err
	}
	return d, nil
}
