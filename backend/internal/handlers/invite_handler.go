package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
)

// inviteTTL is how long an invitation link stays valid.
const inviteTTL = 14 * 24 * time.Hour

// ListInvites returns a workspace's pending invitations.
func (h *Handlers) ListInvites(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	list, err := h.Store.Invites.ListPending(r.Context(), ws.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"invites": list})
}

type createInviteRequest struct {
	Email string `json:"email"`
	Role  string `json:"role"`
}

// CreateInvite pre-authorises an email address to join the workspace.
//
// The invite link is returned to the admin rather than emailed: Flowie has no
// SMTP configured, and handing back the URL keeps the feature usable (paste it
// into chat) without pretending an email was sent.
func (h *Handlers) CreateInvite(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	var req createInviteRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || !strings.Contains(email, "@") {
		httpx.Error(w, http.StatusBadRequest, "validation", "email không hợp lệ")
		return
	}
	role := domain.WorkspaceRole(strings.TrimSpace(req.Role))
	switch role {
	case domain.WorkspaceRoleAdmin, domain.WorkspaceRoleBilling,
		domain.WorkspaceRoleMember, domain.WorkspaceRoleGuest:
	case "":
		role = domain.WorkspaceRoleMember
	default:
		// Owner is deliberately not invitable — ownership is transferred, not granted.
		httpx.Error(w, http.StatusBadRequest, "validation", "vai trò không hợp lệ")
		return
	}

	token, err := store.GenerateInviteToken()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "token_failed", err.Error())
		return
	}
	invite, err := h.Store.Invites.Create(r.Context(), ws.ID, email, role, userID, token, inviteTTL)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	h.audit(r, store.AuditMemberAdded, email, &ws.ID, map[string]any{"invited": true, "role": role})

	httpx.JSON(w, http.StatusCreated, map[string]any{
		"invite": invite,
		// Shown once; only the hash is stored.
		"inviteUrl": h.Cfg.FrontendURL + "/invite/" + token,
	})
}

// RevokeInvite cancels a pending invitation.
func (h *Handlers) RevokeInvite(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	id, ok := parseUUIDParam(w, r, "inviteID")
	if !ok {
		return
	}
	if err := h.Store.Invites.Revoke(r.Context(), ws.ID, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "invite không tồn tại")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "revoke_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

type acceptInviteRequest struct {
	Token string `json:"token"`
}

// AcceptInvite redeems an invitation for the signed-in user.
func (h *Handlers) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := auth.UserID(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthenticated", "")
		return
	}
	user, err := h.Store.Users.GetByID(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "user not found")
		return
	}
	var req acceptInviteRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	invite, err := h.Store.Invites.Accept(r.Context(), strings.TrimSpace(req.Token), userID, user.Email)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrInviteEmailMismatch):
			httpx.Error(w, http.StatusForbidden, "email_mismatch",
				"lời mời này dành cho một địa chỉ email khác")
		case errors.Is(err, store.ErrNotFound):
			httpx.Error(w, http.StatusNotFound, "invalid_invite",
				"lời mời không hợp lệ hoặc đã hết hạn")
		default:
			httpx.Error(w, http.StatusInternalServerError, "accept_failed", err.Error())
		}
		return
	}
	h.audit(r, store.AuditMemberAdded, user.Email, &invite.WorkspaceID,
		map[string]any{"via": "invite", "role": invite.Role})
	httpx.JSON(w, http.StatusOK, map[string]any{"workspaceId": invite.WorkspaceID})
}
