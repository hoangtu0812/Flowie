package handlers

import (
	"net/http"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
	"github.com/google/uuid"
)

// ProjectStats returns aggregate analytics for a project.
func (h *Handlers) ProjectStats(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	stats, err := h.Store.Tasks.ProjectStats(r.Context(), proj.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "stats_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, stats)
}

// Dashboard returns the caller's summary metrics.
func (h *Handlers) Dashboard(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	wsIDStr := r.URL.Query().Get("workspace_id")
	var stats interface{}
	var err error

	if wsIDStr != "" {
		wsID, pErr := uuid.Parse(wsIDStr)
		if pErr != nil {
			httpx.Error(w, http.StatusBadRequest, "invalid_workspace", "Invalid workspace ID")
			return
		}
		stats, err = h.Store.Tasks.WorkspaceDashboardStats(r.Context(), userID, wsID)
	} else {
		stats, err = h.Store.Tasks.DashboardStats(r.Context(), userID)
	}

	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "stats_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, stats)
}
