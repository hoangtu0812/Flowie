package handlers

import (
	"errors"
	"net/http"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

// ListTaskDependencies returns the blockedBy/blocks edges for a task.
func (h *Handlers) ListTaskDependencies(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, _, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	deps, err := h.Store.Tasks.ListDependencies(r.Context(), task.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, deps)
}

type addDependencyRequest struct {
	DependsOnID uuid.UUID `json:"dependsOnId"`
}

// AddTaskDependency records that the task is blocked by another task.
func (h *Handlers) AddTaskDependency(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, role, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot edit dependencies")
		return
	}
	var req addDependencyRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if req.DependsOnID == uuid.Nil {
		httpx.Error(w, http.StatusBadRequest, "validation", "dependsOnId is required")
		return
	}

	// The blocking task must exist and live in the same project.
	dep, err := h.Store.Tasks.GetByID(r.Context(), req.DependsOnID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "dependency task not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "lookup_failed", err.Error())
		return
	}
	if dep.ProjectID != task.ProjectID {
		httpx.Error(w, http.StatusBadRequest, "validation", "dependency must be in the same project")
		return
	}

	if err := h.Store.Tasks.AddDependency(r.Context(), task.ID, req.DependsOnID); err != nil {
		switch {
		case errors.Is(err, store.ErrSelfDependency):
			httpx.Error(w, http.StatusBadRequest, "self_dependency", err.Error())
		case errors.Is(err, store.ErrDependencyCycle):
			httpx.Error(w, http.StatusConflict, "dependency_cycle", "adding this dependency would create a cycle")
		default:
			httpx.Error(w, http.StatusInternalServerError, "add_failed", err.Error())
		}
		return
	}
	_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, userID, "dependency_added",
		map[string]any{"dependsOnId": req.DependsOnID.String(), "title": dep.Title})

	deps, err := h.Store.Tasks.ListDependencies(r.Context(), task.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, deps)
}

// RemoveTaskDependency deletes a blockedBy edge from the task.
func (h *Handlers) RemoveTaskDependency(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, role, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot edit dependencies")
		return
	}
	depID, ok := parseUUIDParam(w, r, "depID")
	if !ok {
		return
	}
	if err := h.Store.Tasks.RemoveDependency(r.Context(), task.ID, depID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "remove_failed", err.Error())
		return
	}
	_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, userID, "dependency_removed",
		map[string]any{"dependsOnId": depID.String()})
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
