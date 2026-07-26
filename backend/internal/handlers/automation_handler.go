package handlers

import (
	"net/http"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/google/uuid"
)

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

type createAutomationV2Request struct {
	Name          string                       `json:"name"`
	TriggerType   string                       `json:"triggerType"`
	TriggerStatus string                       `json:"triggerStatus"`
	Conditions    []domain.AutomationCondition `json:"conditions"`
	Actions       []domain.AutomationAction    `json:"actions"`
}

var validActionTypes = map[string]bool{
	"assign": true, "set_status": true, "set_priority": true, "notify": true,
}
var validCondOps = map[string]bool{
	"eq": true, "neq": true, "is_empty": true, "not_empty": true, "gt": true, "lt": true,
}
var validCondFields = map[string]bool{
	"priority": true, "status": true, "assignee": true, "story_points": true, "moscow": true,
}

// CreateAutomationV2 adds a Trigger → Condition → Action rule.
func (h *Handlers) CreateAutomationV2(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only owner/admin can manage automations")
		return
	}
	var req createAutomationV2Request
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}
	if req.TriggerType == "" {
		req.TriggerType = domain.TriggerStatusChanged
	}
	if req.TriggerType == domain.TriggerStatusChanged && strings.TrimSpace(req.TriggerStatus) == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "triggerStatus is required for status_changed")
		return
	}
	if len(req.Actions) == 0 {
		httpx.Error(w, http.StatusBadRequest, "validation", "at least one action is required")
		return
	}
	for _, a := range req.Actions {
		if !validActionTypes[a.Type] {
			httpx.Error(w, http.StatusBadRequest, "validation", "unknown action type: "+a.Type)
			return
		}
		if (a.Type == "assign" || a.Type == "notify") && a.UserID == "" {
			httpx.Error(w, http.StatusBadRequest, "validation", a.Type+" requires userId")
			return
		}
		if (a.Type == "set_status" || a.Type == "set_priority") && a.Value == "" {
			httpx.Error(w, http.StatusBadRequest, "validation", a.Type+" requires value")
			return
		}
	}
	for _, c := range req.Conditions {
		if !validCondFields[c.Field] || !validCondOps[c.Op] {
			httpx.Error(w, http.StatusBadRequest, "validation", "invalid condition field/op")
			return
		}
	}

	rule, err := h.Store.Automations.CreateV2(r.Context(), proj.ID, req.Name,
		req.TriggerType, strings.TrimSpace(req.TriggerStatus), req.Conditions, req.Actions)
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
