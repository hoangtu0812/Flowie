package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

// taskFieldValue resolves the comparable value of a task field for conditions.
// The second result reports whether the field currently has a value.
func taskFieldValue(t *domain.Task, field string) (string, bool) {
	switch field {
	case "priority":
		return t.Priority, t.Priority != ""
	case "status":
		return t.Status, t.Status != ""
	case "assignee":
		if t.AssigneeID == nil {
			return "", false
		}
		return t.AssigneeID.String(), true
	case "story_points":
		if t.StoryPoints == nil {
			return "", false
		}
		return strconv.FormatFloat(*t.StoryPoints, 'f', -1, 64), true
	case "moscow":
		if t.Moscow == nil {
			return "", false
		}
		return *t.Moscow, true
	default:
		return "", false
	}
}

// evalCondition applies one condition against a task.
func evalCondition(t *domain.Task, c domain.AutomationCondition) bool {
	actual, present := taskFieldValue(t, c.Field)
	switch c.Op {
	case "is_empty":
		return !present
	case "not_empty":
		return present
	case "eq":
		return present && strings.EqualFold(actual, c.Value)
	case "neq":
		return !present || !strings.EqualFold(actual, c.Value)
	case "gt", "lt":
		a, err1 := strconv.ParseFloat(actual, 64)
		b, err2 := strconv.ParseFloat(c.Value, 64)
		if err1 != nil || err2 != nil {
			return false
		}
		if c.Op == "gt" {
			return a > b
		}
		return a < b
	default:
		return false
	}
}

// conditionsMet reports whether every condition passes (AND semantics).
// An empty list always matches.
func conditionsMet(t *domain.Task, conds []domain.AutomationCondition) bool {
	for _, c := range conds {
		if !evalCondition(t, c) {
			return false
		}
	}
	return true
}

// applyAction performs one action, returning true when the task changed.
func (h *Handlers) applyAction(r *http.Request, task *domain.Task, ruleName string, a domain.AutomationAction, actorID uuid.UUID) bool {
	switch a.Type {
	case "assign":
		uid, err := uuid.Parse(a.UserID)
		if err != nil {
			return false
		}
		if _, err := h.Store.Tasks.Update(r.Context(), task.ID, store.TaskUpdateFields{
			SetAssignee: true, AssigneeID: &uid,
		}); err != nil {
			return false
		}
		_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, actorID, "automation",
			map[string]any{"rule": ruleName, "assigned": uid.String()})
		if uid != actorID {
			_ = h.Store.Notifications.Create(r.Context(), uid, "assigned",
				"Tự động giao việc (automation)", task.Title, &task.ID,
				taskLink(task.ProjectID, task.ID))
		}
		return true

	case "set_priority":
		if a.Value == "" {
			return false
		}
		v := a.Value
		if _, err := h.Store.Tasks.Update(r.Context(), task.ID, store.TaskUpdateFields{
			Priority: &v,
		}); err != nil {
			return false
		}
		_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, actorID, "automation",
			map[string]any{"rule": ruleName, "priority": v})
		return true

	case "set_status":
		// Guard against a rule that re-triggers itself endlessly.
		if a.Value == "" || a.Value == task.Status {
			return false
		}
		if _, err := h.Store.Tasks.UpdateStatus(r.Context(), task.ID, a.Value); err != nil {
			return false
		}
		_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, actorID, "automation",
			map[string]any{"rule": ruleName, "status": a.Value})
		return true

	case "notify":
		uid, err := uuid.Parse(a.UserID)
		if err != nil {
			return false
		}
		msg := a.Message
		if msg == "" {
			msg = task.Title
		}
		_ = h.Store.Notifications.Create(r.Context(), uid, "automation",
			"Automation: "+ruleName, msg, &task.ID, taskLink(task.ProjectID, task.ID))
		return false
	}
	return false
}

// runAutomations applies every active rule whose trigger and conditions match.
//
// Best-effort: individual failures are ignored so a rule never breaks the
// user's original action. Actions run at most one pass — a rule that changes
// status does not recursively re-trigger the engine.
func (h *Handlers) runAutomations(r *http.Request, task *domain.Task, actorID uuid.UUID) {
	rules, err := h.Store.Automations.ActiveForTrigger(r.Context(), task.ProjectID, task.Status)
	if err != nil {
		return
	}
	for _, rule := range rules {
		if !conditionsMet(task, rule.Conditions) {
			continue
		}
		actions := rule.Actions
		// Fall back to the v1 shape for rules created before the DSL existed.
		if len(actions) == 0 && rule.ActionType == "assign" && rule.ActionAssigneeID != nil {
			actions = []domain.AutomationAction{{Type: "assign", UserID: rule.ActionAssigneeID.String()}}
		}
		for _, a := range actions {
			h.applyAction(r, task, rule.Name, a, actorID)
		}
	}
}
