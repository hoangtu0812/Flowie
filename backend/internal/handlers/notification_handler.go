package handlers

import (
	"net/http"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
)

// ListNotifications returns the caller's recent notifications + unread count.
func (h *Handlers) ListNotifications(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	items, unread, err := h.Store.Notifications.ListForUser(r.Context(), userID, 50)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"notifications": items, "unread": unread})
}

// MarkAllNotificationsRead marks all of the caller's notifications read.
func (h *Handlers) MarkAllNotificationsRead(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	if err := h.Store.Notifications.MarkAllRead(r.Context(), userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// MarkNotificationRead marks a single notification read.
func (h *Handlers) MarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	id, ok := parseUUIDParam(w, r, "notifID")
	if !ok {
		return
	}
	if err := h.Store.Notifications.MarkRead(r.Context(), userID, id); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
