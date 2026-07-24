package handlers

import (
	"net/http"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
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

// Dashboard returns the caller's cross-workspace summary metrics.
func (h *Handlers) Dashboard(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	stats, err := h.Store.Tasks.DashboardStats(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "stats_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, stats)
}
