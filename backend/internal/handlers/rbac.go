package handlers

import (
	"net/http"

	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

// parseUUIDParam reads a UUID URL param, writing a 400 on failure.
func parseUUIDParam(w http.ResponseWriter, r *http.Request, name string) (uuid.UUID, bool) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_id", name+" must be a valid uuid")
		return uuid.Nil, false
	}
	return id, true
}

// requireWorkspaceMember loads the workspace in the "workspaceID" URL param and
// verifies the user is a member. It writes the appropriate error response and
// returns ok=false when access should be denied.
func (h *Handlers) requireWorkspaceMember(w http.ResponseWriter, r *http.Request, userID uuid.UUID) (*domain.Workspace, domain.WorkspaceRole, bool) {
	wsID, ok := parseUUIDParam(w, r, "workspaceID")
	if !ok {
		return nil, "", false
	}
	role, err := h.Store.Workspaces.RoleForUser(r.Context(), wsID, userID)
	if err != nil {
		// Not a member (or not found) — return 404 to avoid leaking existence.
		httpx.Error(w, http.StatusNotFound, "not_found", "workspace not found")
		return nil, "", false
	}
	ws, err := h.Store.Workspaces.GetByID(r.Context(), wsID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "workspace not found")
		return nil, "", false
	}
	return ws, role, true
}

// requireProjectAccess loads the project in the "projectID" URL param and
// verifies the user is a member of its workspace.
func (h *Handlers) requireProjectAccess(w http.ResponseWriter, r *http.Request, userID uuid.UUID) (*domain.Project, domain.WorkspaceRole, bool) {
	projID, ok := parseUUIDParam(w, r, "projectID")
	if !ok {
		return nil, "", false
	}
	proj, err := h.Store.Projects.GetByID(r.Context(), projID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "project not found")
		return nil, "", false
	}
	role, err := h.Store.Workspaces.RoleForUser(r.Context(), proj.WorkspaceID, userID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "project not found")
		return nil, "", false
	}
	return proj, role, true
}

// canManageWorkspace reports whether a role may perform admin-level actions.
func canManageWorkspace(role domain.WorkspaceRole) bool {
	return role == domain.WorkspaceRoleOwner || role == domain.WorkspaceRoleAdmin
}
