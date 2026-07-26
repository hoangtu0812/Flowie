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
	// Dates are optional; a sprint can be shaped first and scheduled later.
	StartDate string `json:"startDate"` // "YYYY-MM-DD"
	EndDate   string `json:"endDate"`
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
	start, startOK := parseDate(req.StartDate)
	end, endOK := parseDate(req.EndDate)
	if !startOK || !endOK {
		httpx.Error(w, http.StatusBadRequest, "validation", "dates must be YYYY-MM-DD")
		return
	}
	if start != nil && end != nil && end.Before(*start) {
		httpx.Error(w, http.StatusBadRequest, "validation", "end date must not precede start date")
		return
	}
	sp, err := h.Store.Sprints.Create(r.Context(), proj.ID, req.Name, strings.TrimSpace(req.Goal))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	// Dates live on the update path; apply them here so the client needs one call.
	if start != nil || end != nil {
		f := store.SprintUpdateFields{
			SetStartDate: start != nil, StartDate: start,
			SetEndDate: end != nil, EndDate: end,
		}
		if updated, uerr := h.Store.Sprints.Update(r.Context(), sp.ID, f); uerr == nil {
			sp = updated
		}
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
	Name      *string `json:"name"`
	Goal      *string `json:"goal"`
	State     *string `json:"state"`
	StartDate *string `json:"startDate"` // "YYYY-MM-DD" or "" to clear
	EndDate   *string `json:"endDate"`
}

// requireSprintAccess resolves the sprint in the URL and checks membership.
func (h *Handlers) requireSprintAccess(w http.ResponseWriter, r *http.Request, userID uuid.UUID) (*domain.Sprint, bool) {
	sprintID, ok := parseUUIDParam(w, r, "sprintID")
	if !ok {
		return nil, false
	}
	sp, err := h.Store.Sprints.GetByID(r.Context(), sprintID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "sprint not found")
		return nil, false
	}
	proj, err := h.Store.Projects.GetByID(r.Context(), sp.ProjectID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "sprint not found")
		return nil, false
	}
	if _, err := h.Store.Workspaces.RoleForUser(r.Context(), proj.WorkspaceID, userID); err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "sprint not found")
		return nil, false
	}
	return sp, true
}

// SprintBurndown returns the burndown series for a sprint (Module 5.1).
func (h *Handlers) SprintBurndown(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	sp, ok := h.requireSprintAccess(w, r, userID)
	if !ok {
		return
	}
	bd, err := h.Store.Sprints.Burndown(r.Context(), sp.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "burndown_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, bd)
}

// SprintCapacity returns a sprint's load per assignee (Module 3.2).
func (h *Handlers) SprintCapacity(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	sp, ok := h.requireSprintAccess(w, r, userID)
	if !ok {
		return
	}
	capacity, err := h.Store.Sprints.Capacity(r.Context(), sp.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "capacity_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, capacity)
}

// ProjectVelocity returns committed vs completed points per sprint.
func (h *Handlers) ProjectVelocity(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	vs, err := h.Store.Sprints.Velocity(r.Context(), proj.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "velocity_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"sprints": vs})
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
	f := store.SprintUpdateFields{Name: req.Name, Goal: req.Goal, State: req.State}
	if req.StartDate != nil {
		if d, valid := parseDate(*req.StartDate); valid {
			f.SetStartDate = true
			f.StartDate = d
		}
	}
	if req.EndDate != nil {
		if d, valid := parseDate(*req.EndDate); valid {
			f.SetEndDate = true
			f.EndDate = d
		}
	}
	updated, err := h.Store.Sprints.Update(r.Context(), sprintID, f)
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
	_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, userID, "field_changed", map[string]any{
		"field": "sprint",
		"from":  h.sprintName(r.Context(), task.SprintID),
		"to":    h.sprintName(r.Context(), req.SprintID),
	})
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
