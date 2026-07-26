package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

// requireWorkspaceManager loads the workspace and rejects non owner/admin
// callers — used by every IAM mutation.
func (h *Handlers) requireWorkspaceManager(w http.ResponseWriter, r *http.Request, userID uuid.UUID) (*domain.Workspace, bool) {
	ws, role, ok := h.requireWorkspaceMember(w, r, userID)
	if !ok {
		return nil, false
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "requires workspace owner or admin")
		return nil, false
	}
	return ws, true
}

// validPermissions filters the request down to the known permission catalogue,
// so a client cannot invent capabilities.
func validPermissions(in []string) []domain.Permission {
	allowed := map[string]bool{}
	for _, p := range domain.AllPermissions {
		allowed[p] = true
	}
	out := []domain.Permission{}
	seen := map[string]bool{}
	for _, p := range in {
		p = strings.TrimSpace(p)
		if allowed[p] && !seen[p] {
			out = append(out, p)
			seen[p] = true
		}
	}
	return out
}

// ListPermissions returns the permission catalogue for the role editor UI.
func (h *Handlers) ListPermissions(w http.ResponseWriter, r *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]any{"permissions": domain.AllPermissions})
}

// ── Custom roles ──

// ListCustomRoles returns a workspace's custom roles.
func (h *Handlers) ListCustomRoles(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, _, ok := h.requireWorkspaceMember(w, r, userID)
	if !ok {
		return
	}
	roles, err := h.Store.Workspaces.ListCustomRoles(r.Context(), ws.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"roles": roles})
}

type customRoleRequest struct {
	Name        string   `json:"name"`
	Permissions []string `json:"permissions"`
}

// CreateCustomRole adds a custom role to a workspace.
func (h *Handlers) CreateCustomRole(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	var req customRoleRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}
	role, err := h.Store.Workspaces.CreateCustomRole(r.Context(), ws.ID, req.Name, validPermissions(req.Permissions))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, role)
}

// UpdateCustomRole replaces a role's name/permissions.
func (h *Handlers) UpdateCustomRole(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	roleID, ok := parseUUIDParam(w, r, "roleID")
	if !ok {
		return
	}
	var req customRoleRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}
	err := h.Store.Workspaces.UpdateCustomRole(r.Context(), ws.ID, roleID, req.Name, validPermissions(req.Permissions))
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "role not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// DeleteCustomRole removes a custom role.
func (h *Handlers) DeleteCustomRole(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	roleID, ok := parseUUIDParam(w, r, "roleID")
	if !ok {
		return
	}
	if err := h.Store.Workspaces.DeleteCustomRole(r.Context(), ws.ID, roleID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "role not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

type assignRoleRequest struct {
	RoleID *string `json:"roleId"` // null or "" clears the custom role
}

// AssignCustomRole attaches a custom role to a workspace member.
func (h *Handlers) AssignCustomRole(w http.ResponseWriter, r *http.Request) {
	actorID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, actorID)
	if !ok {
		return
	}
	memberID, ok := parseUUIDParam(w, r, "userID")
	if !ok {
		return
	}
	var req assignRoleRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	var roleID *uuid.UUID
	if req.RoleID != nil && *req.RoleID != "" {
		id, err := uuid.Parse(*req.RoleID)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid_id", "roleId must be a valid uuid")
			return
		}
		roleID = &id
	}
	h.audit(r, store.AuditCustomRoleSet, memberID.String(), &ws.ID,
		map[string]any{"roleId": req.RoleID})
	if err := h.Store.Workspaces.AssignCustomRole(r.Context(), ws.ID, memberID, roleID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "member not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── Teams ──

// ListTeams returns a workspace's teams with members.
func (h *Handlers) ListTeams(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, _, ok := h.requireWorkspaceMember(w, r, userID)
	if !ok {
		return
	}
	teams, err := h.Store.Workspaces.ListTeams(r.Context(), ws.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"teams": teams})
}

type createTeamRequest struct {
	Name string `json:"name"`
}

// CreateTeam adds a team to a workspace.
func (h *Handlers) CreateTeam(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	var req createTeamRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}
	team, err := h.Store.Workspaces.CreateTeam(r.Context(), ws.ID, req.Name)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, team)
}

// DeleteTeam removes a team.
func (h *Handlers) DeleteTeam(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	teamID, ok := parseUUIDParam(w, r, "teamID")
	if !ok {
		return
	}
	if err := h.Store.Workspaces.DeleteTeam(r.Context(), ws.ID, teamID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "team not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

type teamMemberRequest struct {
	UserID uuid.UUID `json:"userId"`
	On     bool      `json:"on"`
}

// SetTeamMember adds/removes a member from a team.
func (h *Handlers) SetTeamMember(w http.ResponseWriter, r *http.Request) {
	actorID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, actorID)
	if !ok {
		return
	}
	teamID, ok := parseUUIDParam(w, r, "teamID")
	if !ok {
		return
	}
	var req teamMemberRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if req.UserID == uuid.Nil {
		httpx.Error(w, http.StatusBadRequest, "validation", "userId is required")
		return
	}
	if err := h.Store.Workspaces.SetTeamMember(r.Context(), ws.ID, teamID, req.UserID, req.On); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "team or member not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
