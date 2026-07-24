package handlers

import (
	"net/http"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

// runAutomations applies active rules triggered by a task's new status.
// Currently supports the "assign" action. Best-effort: errors are ignored so a
// rule failure never breaks the status update.
func (h *Handlers) runAutomations(r *http.Request, task *domain.Task, actorID uuid.UUID) {
	rules, err := h.Store.Automations.ActiveForTrigger(r.Context(), task.ProjectID, task.Status)
	if err != nil {
		return
	}
	for _, rule := range rules {
		if rule.ActionType == "assign" && rule.ActionAssigneeID != nil {
			_, _ = h.Store.Tasks.Update(r.Context(), task.ID, store.TaskUpdateFields{
				SetAssignee: true,
				AssigneeID:  rule.ActionAssigneeID,
			})
			_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, actorID, "automation",
				map[string]any{"rule": rule.Name, "assigned": rule.ActionAssigneeID.String()})
			if *rule.ActionAssigneeID != actorID {
				_ = h.Store.Notifications.Create(r.Context(), *rule.ActionAssigneeID, "assigned",
					"Tự động giao việc (automation)", task.Title, &task.ID)
			}
		}
	}
}

// ListAutomations returns a project's automation rules.
func (h *Handlers) ListAutomations(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	rules, err := h.Store.Automations.ListByProject(r.Context(), proj.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"rules": rules})
}

type createAutomationRequest struct {
	Name          string     `json:"name"`
	TriggerStatus string     `json:"triggerStatus"`
	AssigneeID    *uuid.UUID `json:"assigneeId"`
}

// CreateAutomation adds an automation rule to a project.
func (h *Handlers) CreateAutomation(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only owner/admin can manage automations")
		return
	}
	var req createAutomationRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.TriggerStatus = strings.TrimSpace(req.TriggerStatus)
	if req.TriggerStatus == "" || req.AssigneeID == nil {
		httpx.Error(w, http.StatusBadRequest, "validation", "triggerStatus and assigneeId required")
		return
	}
	rule, err := h.Store.Automations.Create(r.Context(), proj.ID, strings.TrimSpace(req.Name), req.TriggerStatus, req.AssigneeID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, rule)
}

// DeleteAutomation removes an automation rule.
func (h *Handlers) DeleteAutomation(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ruleID, ok := parseUUIDParam(w, r, "ruleID")
	if !ok {
		return
	}
	// Delete returns the project id; verify manage rights on that project.
	projID, err := h.Store.Automations.Delete(r.Context(), ruleID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "rule not found")
		return
	}
	proj, err := h.Store.Projects.GetByID(r.Context(), projID)
	if err == nil {
		if role, rerr := h.Store.Workspaces.RoleForUser(r.Context(), proj.WorkspaceID, userID); rerr != nil || !canManageWorkspace(role) {
			httpx.Error(w, http.StatusForbidden, "forbidden", "insufficient role")
			return
		}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
