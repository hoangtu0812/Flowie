package store

import (
	"context"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
)

// pctDelta returns the percentage change from prev to cur. When prev is zero it
// reports +100% for any growth and 0% when both periods are empty, avoiding a
// division by zero.
func pctDelta(cur, prev int) float64 {
	if prev == 0 {
		if cur == 0 {
			return 0
		}
		return 100
	}
	return (float64(cur-prev) / float64(prev)) * 100
}

// WorkspaceOverview aggregates every project in a workspace for the dashboard.
func (s *TaskStore) WorkspaceOverview(ctx context.Context, workspaceID uuid.UUID, tr TrendRange) (*domain.WorkspaceOverview, error) {
	o := &domain.WorkspaceOverview{
		ByStatus:   map[string]int{},
		ByPriority: map[string]int{},
		Projects:   []domain.ProjectSummary{},
		Trend:      []domain.TrendPoint{},
	}

	// Task counts by status (+ overdue) across the workspace.
	rows, err := s.pool.Query(ctx, `
		SELECT t.status, count(*),
		       count(*) FILTER (WHERE t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE)
		FROM tasks t
		JOIN projects p ON p.id = t.project_id
		WHERE p.workspace_id = $1
		GROUP BY t.status`, workspaceID)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var status string
		var cnt, overdue int
		if err := rows.Scan(&status, &cnt, &overdue); err != nil {
			rows.Close()
			return nil, err
		}
		o.ByStatus[status] = cnt
		o.TotalTasks += cnt
		o.OverdueTasks += overdue
		switch status {
		case "done":
			o.DoneTasks += cnt
		case "in_progress":
			o.InProgressTask += cnt
		case "todo":
			o.BacklogTasks += cnt
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Priority breakdown.
	prows, err := s.pool.Query(ctx, `
		SELECT t.priority, count(*)
		FROM tasks t
		JOIN projects p ON p.id = t.project_id
		WHERE p.workspace_id = $1
		GROUP BY t.priority`, workspaceID)
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
		o.ByPriority[pr] = cnt
	}
	prows.Close()
	if err := prows.Err(); err != nil {
		return nil, err
	}

	// Headline counters + hours/cost.
	err = s.pool.QueryRow(ctx, `
		SELECT
		  (SELECT count(*) FROM projects WHERE workspace_id = $1),
		  (SELECT count(*) FROM workspace_members WHERE workspace_id = $1),
		  (SELECT COALESCE(SUM(w.minutes),0)/60.0
		     FROM worklogs w JOIN tasks t ON t.id = w.task_id JOIN projects p ON p.id = t.project_id
		     WHERE p.workspace_id = $1),
		  (SELECT COALESCE(SUM(w.minutes/60.0 * COALESCE(r.hourly_rate,0)),0)
		     FROM worklogs w JOIN tasks t ON t.id = w.task_id JOIN projects p ON p.id = t.project_id
		     LEFT JOIN user_rates r ON r.user_id = w.user_id
		     WHERE p.workspace_id = $1)`, workspaceID).
		Scan(&o.ProjectCount, &o.MemberCount, &o.HoursLogged, &o.CostActual)
	if err != nil {
		return nil, err
	}

	// 30d vs previous 30d deltas.
	var curCreated, prevCreated, curDone, prevDone int
	err = s.pool.QueryRow(ctx, `
		WITH done_at AS (
		    SELECT COALESCE((SELECT max(a.created_at) FROM activity_events a
		                      WHERE a.task_id = t.id AND a.verb='status_changed' AND a.meta->>'to'='done'),
		                    t.updated_at) AS at
		    FROM tasks t JOIN projects p ON p.id = t.project_id
		    WHERE p.workspace_id = $1 AND t.status = 'done'
		)
		SELECT
		  (SELECT count(*) FROM tasks t JOIN projects p ON p.id=t.project_id
		     WHERE p.workspace_id=$1 AND t.created_at >= now() - interval '30 days'),
		  (SELECT count(*) FROM tasks t JOIN projects p ON p.id=t.project_id
		     WHERE p.workspace_id=$1 AND t.created_at >= now() - interval '60 days'
		       AND t.created_at < now() - interval '30 days'),
		  (SELECT count(*) FROM done_at WHERE at >= now() - interval '30 days'),
		  (SELECT count(*) FROM done_at WHERE at >= now() - interval '60 days' AND at < now() - interval '30 days')`,
		workspaceID).Scan(&curCreated, &prevCreated, &curDone, &prevDone)
	if err != nil {
		return nil, err
	}
	o.CreatedDelta = pctDelta(curCreated, prevCreated)
	o.CompletedDelta = pctDelta(curDone, prevDone)

	// Per-project rollup.
	sumRows, err := s.pool.Query(ctx, `
		SELECT p.id, p.key, p.name, p.status,
		       count(t.id),
		       count(t.id) FILTER (WHERE t.status = 'done'),
		       count(t.id) FILTER (WHERE t.status = 'in_progress'),
		       count(t.id) FILTER (WHERE t.status = 'todo'),
		       count(t.id) FILTER (WHERE t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE),
		       COALESCE((SELECT SUM(w.minutes)/60.0 FROM worklogs w JOIN tasks wt ON wt.id = w.task_id WHERE wt.project_id = p.id), 0),
		       COALESCE((SELECT SUM(w.minutes/60.0 * COALESCE(r.hourly_rate,0))
		                 FROM worklogs w JOIN tasks wt ON wt.id = w.task_id
		                 LEFT JOIN user_rates r ON r.user_id = w.user_id
		                 WHERE wt.project_id = p.id), 0)
		FROM projects p
		LEFT JOIN tasks t ON t.project_id = p.id
		WHERE p.workspace_id = $1
		GROUP BY p.id, p.key, p.name, p.status, p.created_at
		ORDER BY p.created_at DESC`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer sumRows.Close()
	for sumRows.Next() {
		var ps domain.ProjectSummary
		if err := sumRows.Scan(&ps.ProjectID, &ps.Key, &ps.Name, &ps.Status, &ps.Total,
			&ps.Done, &ps.InProgress, &ps.Todo, &ps.Overdue, &ps.HoursLogged, &ps.CostActual); err != nil {
			return nil, err
		}
		o.Projects = append(o.Projects, ps)
	}
	if err := sumRows.Err(); err != nil {
		return nil, err
	}

	trend, err := s.trend(ctx, "workspace", workspaceID, tr)
	if err != nil {
		return nil, err
	}
	o.Trend = trend

	meta, err := s.statusMeta(ctx, "workspace", workspaceID)
	if err != nil {
		return nil, err
	}
	o.StatusMeta = meta

	return o, nil
}

// statusMeta returns the display name and colour of every workflow column in
// scope, so charts can label and colour project-defined statuses.
//
// Keys are unique per project, so a workspace with several projects can define
// the same key twice; the first definition wins, which keeps one slice per key
// in the charts.
func (s *TaskStore) statusMeta(ctx context.Context, scope string, id uuid.UUID) ([]domain.StatusMeta, error) {
	scopeCol := "p.workspace_id"
	if scope == "project" {
		scopeCol = "p.id"
	}
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT ON (ws.key) ws.key, ws.name, ws.color
		FROM workflow_statuses ws
		JOIN projects p ON p.id = ws.project_id
		WHERE `+scopeCol+` = $1
		ORDER BY ws.key, ws.position`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.StatusMeta{}
	for rows.Next() {
		var m domain.StatusMeta
		if err := rows.Scan(&m.Key, &m.Label, &m.Color); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// TrendRange selects the bucket size and how many buckets the trend covers.
type TrendRange struct {
	Unit  string // "day" or "month"
	Count int    // number of buckets, ending with the current one
}

// ParseTrendRange maps the API's `range` query value to a bucketing choice.
// Unknown values fall back to 30 days, which is the dashboard default.
func ParseTrendRange(s string) TrendRange {
	switch s {
	case "6m":
		return TrendRange{Unit: "month", Count: 6}
	case "12m":
		return TrendRange{Unit: "month", Count: 12}
	default: // "30d"
		return TrendRange{Unit: "day", Count: 30}
	}
}

// trend returns created/completed/in-work/hours activity per bucket, scoped
// either to a whole workspace or a single project.
//
// A task's "reached status X" timestamp comes from its most recent
// status_changed activity event, falling back to updated_at when the task was
// created directly in that status (or predates activity logging). Each task is
// therefore counted at most once per series.
func (s *TaskStore) trend(ctx context.Context, scope string, id uuid.UUID, tr TrendRange) ([]domain.TrendPoint, error) {
	// The scope predicate is chosen from a fixed set — never interpolated input.
	scopeCol := "p.workspace_id"
	if scope == "project" {
		scopeCol = "p.id"
	}

	// Likewise the bucket unit: whitelisted here, so it is safe to inline into
	// date_trunc (which cannot take the unit as a bind parameter cleanly).
	unit, labelFmt := "month", "YYYY-MM"
	if tr.Unit == "day" {
		unit, labelFmt = "day", "YYYY-MM-DD"
	}
	count := tr.Count
	if count < 1 || count > 366 {
		count = 30
	}

	rows, err := s.pool.Query(ctx, `
		WITH buckets AS (
		    SELECT date_trunc('`+unit+`', CURRENT_DATE) - (n || ' `+unit+`')::interval AS m
		    FROM generate_series($2::int - 1, 0, -1) AS n
		),
		scoped AS (
		    SELECT t.id, t.status, t.created_at, t.updated_at
		    FROM tasks t JOIN projects p ON p.id = t.project_id
		    WHERE `+scopeCol+` = $1
		),
		reached AS (
		    SELECT s.id, s.status,
		           COALESCE((SELECT max(a.created_at) FROM activity_events a
		                      WHERE a.task_id = s.id AND a.verb = 'status_changed'
		                        AND a.meta->>'to' = s.status), s.updated_at) AS at
		    FROM scoped s
		)
		SELECT to_char(buckets.m, '`+labelFmt+`'),
		    (SELECT count(*) FROM scoped s WHERE date_trunc('`+unit+`', s.created_at) = buckets.m),
		    (SELECT count(*) FROM reached r WHERE r.status = 'done' AND date_trunc('`+unit+`', r.at) = buckets.m),
		    (SELECT count(*) FROM reached r WHERE r.status = 'in_progress' AND date_trunc('`+unit+`', r.at) = buckets.m),
		    (SELECT COALESCE(SUM(w.minutes),0)/60.0 FROM worklogs w JOIN tasks t ON t.id = w.task_id JOIN projects p ON p.id = t.project_id
		       WHERE `+scopeCol+` = $1 AND date_trunc('`+unit+`', w.logged_on) = buckets.m)
		FROM buckets
		ORDER BY buckets.m`, id, count)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.TrendPoint{}
	for rows.Next() {
		var tp domain.TrendPoint
		if err := rows.Scan(&tp.Month, &tp.Created, &tp.Completed, &tp.InWork, &tp.Hours); err != nil {
			return nil, err
		}
		out = append(out, tp)
	}
	return out, rows.Err()
}

// ProjectOverview extends ProjectStats with trend and per-assignee load.
func (s *TaskStore) ProjectOverview(ctx context.Context, projectID uuid.UUID, tr TrendRange) (*domain.ProjectOverview, error) {
	base, err := s.ProjectStats(ctx, projectID)
	if err != nil {
		return nil, err
	}
	o := &domain.ProjectOverview{
		ProjectStats: *base,
		Trend:        []domain.TrendPoint{},
		Assignees:    []domain.AssigneeLoad{},
	}

	var curCreated, prevCreated, curDone, prevDone int
	err = s.pool.QueryRow(ctx, `
		WITH done_at AS (
		    SELECT COALESCE((SELECT max(a.created_at) FROM activity_events a
		                      WHERE a.task_id = t.id AND a.verb='status_changed' AND a.meta->>'to'='done'),
		                    t.updated_at) AS at
		    FROM tasks t
		    WHERE t.project_id = $1 AND t.status = 'done'
		)
		SELECT
		  (SELECT count(*) FROM tasks WHERE project_id=$1 AND created_at >= now() - interval '30 days'),
		  (SELECT count(*) FROM tasks WHERE project_id=$1 AND created_at >= now() - interval '60 days'
		     AND created_at < now() - interval '30 days'),
		  (SELECT count(*) FROM done_at WHERE at >= now() - interval '30 days'),
		  (SELECT count(*) FROM done_at WHERE at >= now() - interval '60 days' AND at < now() - interval '30 days'),
		  (SELECT count(*) FROM tasks WHERE project_id=$1 AND status <> 'done'
		     AND due_date IS NOT NULL AND due_date < CURRENT_DATE)
		`, projectID).Scan(&curCreated, &prevCreated, &curDone, &prevDone, &o.OverdueTasks)
	if err != nil {
		return nil, err
	}
	o.CreatedDelta = pctDelta(curCreated, prevCreated)
	o.CompletedDelta = pctDelta(curDone, prevDone)

	trend, err := s.trend(ctx, "project", projectID, tr)
	if err != nil {
		return nil, err
	}
	o.Trend = trend

	meta, err := s.statusMeta(ctx, "project", projectID)
	if err != nil {
		return nil, err
	}
	o.StatusMeta = meta

	// Per-assignee load (unassigned tasks collapse into a single bucket).
	rows, err := s.pool.Query(ctx, `
		SELECT t.assignee_id, COALESCE(u.display_name, u.email, 'Chưa gán'),
		       count(*),
		       count(*) FILTER (WHERE t.status = 'done'),
		       count(*) FILTER (WHERE t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < CURRENT_DATE),
		       COALESCE((SELECT SUM(w.minutes)/60.0 FROM worklogs w
		                 WHERE w.task_id IN (SELECT id FROM tasks WHERE project_id = $1 AND assignee_id IS NOT DISTINCT FROM t.assignee_id)), 0)
		FROM tasks t
		LEFT JOIN users u ON u.id = t.assignee_id
		WHERE t.project_id = $1
		GROUP BY t.assignee_id, u.display_name, u.email
		ORDER BY count(*) DESC`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var a domain.AssigneeLoad
		if err := rows.Scan(&a.UserID, &a.DisplayName, &a.Total, &a.Done, &a.Overdue, &a.HoursLogged); err != nil {
			return nil, err
		}
		o.Assignees = append(o.Assignees, a)
	}
	return o, rows.Err()
}
