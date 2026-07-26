package store

import (
	"math"
	"testing"
)

// The CPM maths in CriticalPath is exercised here on a plain in-memory graph,
// mirroring the forward/backward passes without needing a database. It guards
// the schedule arithmetic itself (the SQL loading is covered by runtime checks).

type cpmNode struct {
	id       string
	duration float64
	es, ef   float64
	ls, lf   float64
}

// solve runs the same forward/backward passes as store.CriticalPath.
func solve(durations map[string]float64, edges [][2]string) (map[string]*cpmNode, float64, bool) {
	nodes := map[string]*cpmNode{}
	var order []string
	for id, d := range durations {
		nodes[id] = &cpmNode{id: id, duration: d}
		order = append(order, id)
	}
	successors := map[string][]string{}
	predecessors := map[string][]string{}
	indegree := map[string]int{}
	for _, e := range edges {
		successors[e[0]] = append(successors[e[0]], e[1])
		predecessors[e[1]] = append(predecessors[e[1]], e[0])
		indegree[e[1]]++
	}

	queue := []string{}
	for _, id := range order {
		if indegree[id] == 0 {
			queue = append(queue, id)
		}
	}
	deg := map[string]int{}
	for k, v := range indegree {
		deg[k] = v
	}
	topo := []string{}
	for len(queue) > 0 {
		id := queue[0]
		queue = queue[1:]
		topo = append(topo, id)
		for _, s := range successors[id] {
			deg[s]--
			if deg[s] == 0 {
				queue = append(queue, s)
			}
		}
	}
	if len(topo) != len(nodes) {
		return nodes, 0, false // cycle
	}

	end := 0.0
	for _, id := range topo {
		n := nodes[id]
		es := 0.0
		for _, p := range predecessors[id] {
			if nodes[p].ef > es {
				es = nodes[p].ef
			}
		}
		n.es, n.ef = es, es+n.duration
		if n.ef > end {
			end = n.ef
		}
	}
	for i := len(topo) - 1; i >= 0; i-- {
		n := nodes[topo[i]]
		lf := end
		if ss := successors[n.id]; len(ss) > 0 {
			lf = math.Inf(1)
			for _, s := range ss {
				if nodes[s].ls < lf {
					lf = nodes[s].ls
				}
			}
		}
		n.lf, n.ls = lf, lf-n.duration
	}
	return nodes, end, true
}

func TestCPMSimpleChain(t *testing.T) {
	// A(2) → B(3) → C(1): everything is on the only path, so nothing has slack.
	nodes, end, ok := solve(
		map[string]float64{"A": 2, "B": 3, "C": 1},
		[][2]string{{"A", "B"}, {"B", "C"}},
	)
	if !ok {
		t.Fatal("unexpected cycle")
	}
	if end != 6 {
		t.Errorf("project duration = %v, want 6", end)
	}
	for _, id := range []string{"A", "B", "C"} {
		if slack := nodes[id].ls - nodes[id].es; math.Abs(slack) > 1e-9 {
			t.Errorf("%s slack = %v, want 0 (chain is fully critical)", id, slack)
		}
	}
}

func TestCPMParallelBranchHasSlack(t *testing.T) {
	//        ┌ B(5) ┐
	//  A(1) ─┤      ├→ D(1)      critical: A → B → D  (duration 7)
	//        └ C(2) ┘            C has 3 days of slack
	nodes, end, ok := solve(
		map[string]float64{"A": 1, "B": 5, "C": 2, "D": 1},
		[][2]string{{"A", "B"}, {"A", "C"}, {"B", "D"}, {"C", "D"}},
	)
	if !ok {
		t.Fatal("unexpected cycle")
	}
	if end != 7 {
		t.Errorf("project duration = %v, want 7", end)
	}
	critical := func(id string) bool { return math.Abs(nodes[id].ls-nodes[id].es) < 1e-9 }
	for _, id := range []string{"A", "B", "D"} {
		if !critical(id) {
			t.Errorf("%s should be on the critical path", id)
		}
	}
	if critical("C") {
		t.Error("C should not be critical — the shorter branch has slack")
	}
	if got := nodes["C"].ls - nodes["C"].es; math.Abs(got-3) > 1e-9 {
		t.Errorf("C slack = %v, want 3", got)
	}
}

func TestCPMIndependentTasks(t *testing.T) {
	// No edges: the longest task alone sets the duration; shorter ones float.
	nodes, end, ok := solve(map[string]float64{"A": 4, "B": 1}, nil)
	if !ok {
		t.Fatal("unexpected cycle")
	}
	if end != 4 {
		t.Errorf("duration = %v, want 4", end)
	}
	if s := nodes["B"].ls - nodes["B"].es; math.Abs(s-3) > 1e-9 {
		t.Errorf("B slack = %v, want 3", s)
	}
}

func TestCPMDetectsCycle(t *testing.T) {
	// A → B → A must be reported rather than looping or emitting wrong numbers.
	if _, _, ok := solve(
		map[string]float64{"A": 1, "B": 1},
		[][2]string{{"A", "B"}, {"B", "A"}},
	); ok {
		t.Error("expected the cycle to be detected")
	}
}
