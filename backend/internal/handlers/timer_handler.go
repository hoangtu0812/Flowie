package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
)

type timerRequest struct {
	Note string `json:"note"`
}

// StartTimer begins a stopwatch on a task for the caller.
func (h *Handlers) StartTimer(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, role, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot log time")
		return
	}
	var req timerRequest
	_ = httpx.Decode(r, &req) // body is optional

	timer, err := h.Store.Worklogs.StartTimer(r.Context(), userID, task.ID, strings.TrimSpace(req.Note))
	if err != nil {
		if errors.Is(err, store.ErrTimerRunning) {
			httpx.Error(w, http.StatusConflict, "timer_running",
				"một bộ đếm khác đang chạy — hãy dừng nó trước")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "start_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, timer)
}

// GetActiveTimer returns the caller's running timer (or null).
func (h *Handlers) GetActiveTimer(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	timer, err := h.Store.Worklogs.ActiveTimer(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "lookup_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"timer": timer})
}

// StopTimer ends the running timer and records the elapsed time as a worklog.
func (h *Handlers) StopTimer(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	var req timerRequest
	_ = httpx.Decode(r, &req)

	wl, err := h.Store.Worklogs.StopTimer(r.Context(), userID, strings.TrimSpace(req.Note))
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "no_timer", "không có bộ đếm nào đang chạy")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "stop_failed", err.Error())
		return
	}
	_ = h.Store.Tasks.RecordActivity(r.Context(), wl.TaskID, userID, "logged_time",
		map[string]any{"minutes": wl.Minutes, "source": "timer"})
	httpx.JSON(w, http.StatusCreated, wl)
}

// CancelTimer discards the running timer without logging time.
func (h *Handlers) CancelTimer(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	if err := h.Store.Worklogs.CancelTimer(r.Context(), userID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "no_timer", "không có bộ đếm nào đang chạy")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "cancel_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
