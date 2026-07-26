package handlers

import (
	"net/http"
	"strconv"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

// audit records a security event for the current request, filling in the actor
// and client IP automatically.
func (h *Handlers) audit(r *http.Request, action, target string, workspaceID *uuid.UUID, meta map[string]any) {
	e := store.AuditEntry{
		Action:      action,
		Target:      target,
		WorkspaceID: workspaceID,
		IP:          clientIP(r),
		Meta:        meta,
	}
	if uid, ok := auth.UserID(r.Context()); ok {
		e.ActorID = &uid
		if u, err := h.Store.Users.GetByID(r.Context(), uid); err == nil {
			e.ActorEmail = u.Email
		}
	}
	h.Store.Audit.Record(r.Context(), e)
}

// auditFor records an event for a known user, used on paths where the auth
// context is not populated yet (login) or already gone (logout).
func (h *Handlers) auditFor(r *http.Request, userID uuid.UUID, email, action, target string, meta map[string]any) {
	h.Store.Audit.Record(r.Context(), store.AuditEntry{
		ActorID:    &userID,
		ActorEmail: email,
		Action:     action,
		Target:     target,
		IP:         clientIP(r),
		Meta:       meta,
	})
}

// clientIP prefers the proxy header, falling back to the socket address.
func clientIP(r *http.Request) string {
	if ip := r.Header.Get("X-Forwarded-For"); ip != "" {
		return ip
	}
	return r.RemoteAddr
}

// ListAuditLog returns recent security events for a workspace (owner/admin), or
// system-wide for a system admin.
func (h *Handlers) ListAuditLog(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	entries, err := h.Store.Audit.List(r.Context(), &ws.ID, limit)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"entries": entries})
}

// AdminAuditLog returns the system-wide audit trail.
func (h *Handlers) AdminAuditLog(w http.ResponseWriter, r *http.Request) {
	if !h.requireAdmin(w, r) {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	entries, err := h.Store.Audit.List(r.Context(), nil, limit)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"entries": entries})
}
