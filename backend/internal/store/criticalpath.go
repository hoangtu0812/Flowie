package store

import (
	"context"
	"math"
	"time"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
)

// CriticalPath computes the project's critical path with the Critical Path
// Method (CPM).
//
// Duration comes from a task's start/due dates (in days, minimum 1). Edges come
// from task_dependencies: `depends_on_id` must finish before `task_id` starts.
// A task is critical when its total float (slack) is zero — delaying it delays
// the whole project.
func (s *TaskStore) CriticalPath(ctx context.Context, projectID uuid.UUID) (*domain.CriticalPath, error) {
	// 1. Load tasks with their durations.
	rows, err := s.pool.Query(ctx, `
		SELECT id, title, status, start_date, due_date
		FROM tasks
		WHERE project_id = $1 AND parent_task_id IS NULL AND status <> 'done'`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	type node struct {
		id       uuid.UUID
		title    string
		status   string
		duration float64
		es, ef   float64 // earliest start / finish
		ls, lf   float64 // latest start / finish
	}
	nodes := map[uuid.UUID]*node{}
	var order []uuid.UUID

	for rows.Next() {
		var id uuid.UUID
		var title, status string
		var start, due *time.Time
		if err := rows.Scan(&id, &title, &status, &start, &due); err != nil {
			return nil, err
		}
		duration := 1.0
		if start != nil && due != nil {
			d := due.Sub(*start).Hours() / 24
			if d >= 1 {
				duration = math.Round(d)
			}
		}
		nodes[id] = &node{id: id, title: title, status: status, duration: duration, lf: math.Inf(1)}
		order = append(order, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	result := &domain.CriticalPath{Items: []domain.CriticalPathItem{}}
	if len(nodes) == 0 {
		return result, nil
	}

	// 2. Load edges (predecessor → successor) limited to the loaded tasks.
	erows, err := s.pool.Query(ctx, `
		SELECT td.depends_on_id, td.task_id
		FROM task_dependencies td
		JOIN tasks t ON t.id = td.task_id
		WHERE t.project_id = $1`, projectID)
	if err != nil {
		return nil, err
	}
	defer erows.Close()

	successors := map[uuid.UUID][]uuid.UUID{}
	predecessors := map[uuid.UUID][]uuid.UUID{}
	indegree := map[uuid.UUID]int{}
	for erows.Next() {
		var pred, succ uuid.UUID
		if err := erows.Scan(&pred, &succ); err != nil {
			return nil, err
		}
		// Skip edges pointing at tasks outside the set (e.g. completed ones).
		if nodes[pred] == nil || nodes[succ] == nil {
			continue
		}
		successors[pred] = append(successors[pred], succ)
		predecessors[succ] = append(predecessors[succ], pred)
		indegree[succ]++
	}
	if err := erows.Err(); err != nil {
		return nil, err
	}

	// 3. Topological order (Kahn). Cycles are prevented when adding
	// dependencies, but any leftover cycle is simply skipped rather than
	// looping forever.
	queue := make([]uuid.UUID, 0, len(order))
	for _, id := range order {
		if indegree[id] == 0 {
			queue = append(queue, id)
		}
	}
	topo := make([]uuid.UUID, 0, len(order))
	deg := map[uuid.UUID]int{}
	for k, v := range indegree {
		deg[k] = v
	}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		topo = append(topo, id)
		for _, succ := range successors[id] {
			deg[succ]--
			if deg[succ] == 0 {
				queue = append(queue, succ)
			}
		}
	}
	if len(topo) != len(nodes) {
		// Cyclic graph: report no critical path instead of wrong numbers.
		return result, nil
	}

	// 4. Forward pass — earliest start/finish.
	projectEnd := 0.0
	for _, id := range topo {
		n := nodes[id]
		es := 0.0
		for _, p := range predecessors[id] {
			if nodes[p].ef > es {
				es = nodes[p].ef
			}
		}
		n.es = es
		n.ef = es + n.duration
		if n.ef > projectEnd {
			projectEnd = n.ef
		}
	}

	// 5. Backward pass — latest start/finish.
	for i := len(topo) - 1; i >= 0; i-- {
		n := nodes[topo[i]]
		lf := projectEnd
		if succs := successors[n.id]; len(succs) > 0 {
			lf = math.Inf(1)
			for _, s := range succs {
				if nodes[s].ls < lf {
					lf = nodes[s].ls
				}
			}
		}
		n.lf = lf
		n.ls = lf - n.duration
	}

	// 6. Slack = LS − ES; zero slack (within rounding) means critical.
	const eps = 1e-9
	for _, id := range order {
		n := nodes[id]
		slack := n.ls - n.es
		if math.Abs(slack) < eps {
			slack = 0
		}
		item := domain.CriticalPathItem{
			TaskID:     n.id,
			Title:      n.title,
			Status:     n.status,
			Duration:   n.duration,
			EarliestES: n.es,
			EarliestEF: n.ef,
			LatestLS:   n.ls,
			LatestLF:   n.lf,
			Slack:      slack,
			Critical:   slack == 0,
		}
		result.Items = append(result.Items, item)
		if item.Critical {
			result.CriticalTaskIDs = append(result.CriticalTaskIDs, n.id)
		}
	}
	result.ProjectDurationDays = projectEnd
	return result, nil
}
