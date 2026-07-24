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

type createSprintRequest struct {
	Name string `json:"name"`
	Goal string `json:"goal"`
}

// CreateSprint creates a sprint in a project.
func (h *Handlers) CreateSprint(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest || role == domain.WorkspaceRoleBilling {
		httpx.Error(w, http.StatusForbidden, "forbidden", "insufficient role")
		return
	}
	var req createSprintRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}
	sp, err := h.Store.Sprints.Create(r.Context(), proj.ID, req.Name, strings.TrimSpace(req.Goal))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, sp)
}

// ListSprints returns a project's sprints.
func (h *Handlers) ListSprints(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	sprints, err := h.Store.Sprints.ListByProject(r.Context(), proj.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"sprints": sprints})
}

type updateSprintRequest struct {
	Name  *string `json:"name"`
	Goal  *string `json:"goal"`
	State *string `json:"state"`
}

// UpdateSprint patches a sprint (rename, set goal, start/complete).
func (h *Handlers) UpdateSprint(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	sprintID, ok := parseUUIDParam(w, r, "sprintID")
	if !ok {
		return
	}
	sp, err := h.Store.Sprints.GetByID(r.Context(), sprintID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "sprint not found")
		return
	}
	proj, err := h.Store.Projects.GetByID(r.Context(), sp.ProjectID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "sprint not found")
		return
	}
	if _, err := h.Store.Workspaces.RoleForUser(r.Context(), proj.WorkspaceID, userID); err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "sprint not found")
		return
	}
	var req updateSprintRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if req.State != nil {
		switch domain.SprintState(*req.State) {
		case domain.SprintPlanned, domain.SprintActive, domain.SprintCompleted:
		default:
			httpx.Error(w, http.StatusBadRequest, "validation", "invalid state")
			return
		}
	}
	updated, err := h.Store.Sprints.Update(r.Context(), sprintID, store.SprintUpdateFields{
		Name: req.Name, Goal: req.Goal, State: req.State,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, updated)
}

type setSprintRequest struct {
	SprintID *uuid.UUID `json:"sprintId"` // null = backlog
}

// SetTaskSprint moves a task into a sprint or back to the backlog.
func (h *Handlers) SetTaskSprint(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, role, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot plan sprints")
		return
	}
	var req setSprintRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if err := h.Store.Tasks.SetSprint(r.Context(), task.ID, req.SprintID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
