package handlers

import (
	"net/http"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
)

func validWorkspaceRole(role string) bool {
	switch domain.WorkspaceRole(role) {
	case domain.WorkspaceRoleOwner, domain.WorkspaceRoleAdmin, domain.WorkspaceRoleBilling,
		domain.WorkspaceRoleMember, domain.WorkspaceRoleGuest:
		return true
	}
	return false
}

// ListMembers returns the members of a workspace.
func (h *Handlers) ListMembers(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, _, ok := h.requireWorkspaceMember(w, r, userID)
	if !ok {
		return
	}
	members, err := h.Store.Workspaces.ListMembers(r.Context(), ws.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"members": members})
}

// ProjectMembers returns the members of a project's workspace (assignee picker).
func (h *Handlers) ProjectMembers(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	members, err := h.Store.Workspaces.ListMembers(r.Context(), proj.WorkspaceID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"members": members})
}

type addMemberRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// AddMember adds an existing user to the workspace by email.
func (h *Handlers) AddMember(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, role, ok := h.requireWorkspaceMember(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only owner/admin can add members")
		return
	}
	var req addMemberRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Email = strings.TrimSpace(req.Email)
	if req.Role == "" {
		req.Role = string(domain.WorkspaceRoleMember)
	}
	if req.Email == "" || !validWorkspaceRole(req.Role) {
		httpx.Error(w, http.StatusBadRequest, "validation", "valid email and role required")
		return
	}
	m, err := h.Store.Workspaces.AddMemberByEmail(r.Context(), ws.ID, req.Email, domain.WorkspaceRole(req.Role))
	if err != nil {
		if notFound(err) {
			httpx.Error(w, http.StatusNotFound, "user_not_found", "no user with that email has signed in yet")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "add_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, m)
}

type updateMemberRequest struct {
	Role string `json:"role"`
}

// UpdateMember changes a member's role.
func (h *Handlers) UpdateMember(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, role, ok := h.requireWorkspaceMember(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only owner/admin can change roles")
		return
	}
	targetID, ok := parseUUIDParam(w, r, "userID")
	if !ok {
		return
	}
	var req updateMemberRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if !validWorkspaceRole(req.Role) {
		httpx.Error(w, http.StatusBadRequest, "validation", "invalid role")
		return
	}
	if err := h.Store.Workspaces.UpdateMemberRole(r.Context(), ws.ID, targetID, domain.WorkspaceRole(req.Role)); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"userId": targetID, "role": req.Role})
}

type setRateRequest struct {
	HourlyRate float64 `json:"hourlyRate"`
	Currency   string  `json:"currency"`
}

// SetMemberRate upserts a member's hourly billing rate.
func (h *Handlers) SetMemberRate(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	_, role, ok := h.requireWorkspaceMember(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only owner/admin can set rates")
		return
	}
	targetID, ok := parseUUIDParam(w, r, "userID")
	if !ok {
		return
	}
	var req setRateRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if req.Currency == "" {
		req.Currency = "USD"
	}
	if err := h.Store.Workspaces.SetRate(r.Context(), targetID, req.HourlyRate, req.Currency); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"userId": targetID, "hourlyRate": req.HourlyRate, "currency": req.Currency})
}
