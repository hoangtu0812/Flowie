package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
)

const dateFmt = "2006-01-02"

// parseDate parses a "YYYY-MM-DD" string. An empty string returns (nil, true)
// meaning "clear the field"; an invalid string returns (nil, false).
func parseDate(s string) (*time.Time, bool) {
	if s == "" {
		return nil, true
	}
	d, err := time.Parse(dateFmt, s)
	if err != nil {
		return nil, false
	}
	return &d, true
}

// parseDateTime parses an ISO-8601 / datetime-local string. Empty => (nil, true)
// (clear). Accepts RFC3339 and the HTML "2006-01-02T15:04" form.
func parseDateTime(s string) (*time.Time, bool) {
	if s == "" {
		return nil, true
	}
	for _, layout := range []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02T15:04"} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t, true
		}
	}
	return nil, false
}

type logWorkRequest struct {
	Minutes  int    `json:"minutes"`
	Note     string `json:"note"`
	LoggedOn string `json:"loggedOn"`
	Source   string `json:"source"`
}

// LogWork records a time entry on a task.
func (h *Handlers) LogWork(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, _, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	var req logWorkRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if req.Minutes <= 0 {
		httpx.Error(w, http.StatusBadRequest, "validation", "minutes must be > 0")
		return
	}
	loggedOn := time.Now()
	if req.LoggedOn != "" {
		d, err := time.Parse(dateFmt, req.LoggedOn)
		if err != nil {
			httpx.Error(w, http.StatusBadRequest, "validation", "loggedOn must be YYYY-MM-DD")
			return
		}
		loggedOn = d
	}
	source := req.Source
	if source != "timer" {
		source = "manual"
	}
	wl, err := h.Store.Worklogs.Add(r.Context(), task.ID, userID, req.Minutes, strings.TrimSpace(req.Note), source, loggedOn)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "log_failed", err.Error())
		return
	}
	_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, userID, "logged_time", map[string]any{"minutes": req.Minutes})
	httpx.JSON(w, http.StatusCreated, wl)
}

// ListTaskWorklogs returns the worklogs on a task.
func (h *Handlers) ListTaskWorklogs(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, _, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	items, err := h.Store.Worklogs.ListByTask(r.Context(), task.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"worklogs": items})
}

// parseRange reads from/to query params, defaulting to the current week.
func parseRange(r *http.Request) (time.Time, time.Time) {
	now := time.Now()
	from := now.AddDate(0, 0, -int(now.Weekday())+1) // Monday
	to := from.AddDate(0, 0, 6)
	if v := r.URL.Query().Get("from"); v != "" {
		if d, err := time.Parse(dateFmt, v); err == nil {
			from = d
		}
	}
	if v := r.URL.Query().Get("to"); v != "" {
		if d, err := time.Parse(dateFmt, v); err == nil {
			to = d
		}
	}
	return from, to
}

// MyTimesheet returns the caller's worklogs in a date range.
func (h *Handlers) MyTimesheet(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	from, to := parseRange(r)
	entries, err := h.Store.Worklogs.TimesheetForUser(r.Context(), userID, from, to)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"from":    from.Format(dateFmt),
		"to":      to.Format(dateFmt),
		"entries": entries,
	})
}

// ProjectTimesheet returns all worklogs in a project in a date range for owners.
func (h *Handlers) ProjectTimesheet(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if role != domain.WorkspaceRoleOwner {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only owners can view team timesheet")
		return
	}
	from, to := parseRange(r)
	entries, err := h.Store.Worklogs.TimesheetForProject(r.Context(), proj.ID, from, to)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"from":    from.Format(dateFmt),
		"to":      to.Format(dateFmt),
		"entries": entries,
	})
}

// MyCalendar returns tasks with due dates in range across the user's workspaces.
func (h *Handlers) MyCalendar(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	from, to := parseRange(r)
	items, err := h.Store.Tasks.CalendarForUser(r.Context(), userID, from, to)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"tasks": items})
}

type submitTimesheetRequest struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// SubmitTimesheet transitions the caller's draft worklogs in a range to submitted.
func (h *Handlers) SubmitTimesheet(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	var req submitTimesheetRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	from, err := time.Parse(dateFmt, req.From)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "validation", "from must be YYYY-MM-DD")
		return
	}
	to, err := time.Parse(dateFmt, req.To)
	if err != nil {
		httpx.Error(w, http.StatusBadRequest, "validation", "to must be YYYY-MM-DD")
		return
	}
	n, err := h.Store.Worklogs.SubmitRange(r.Context(), userID, from, to)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "submit_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"submitted": n})
}

type setWorklogStateRequest struct {
	State string `json:"state"`
}

// SetWorklogState approves/rejects a worklog. Requires manager-level role in the
// worklog's workspace.
func (h *Handlers) SetWorklogState(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	wlID, ok := parseUUIDParam(w, r, "worklogID")
	if !ok {
		return
	}
	wl, err := h.Store.Worklogs.GetByID(r.Context(), wlID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "worklog not found")
		return
	}
	task, err := h.Store.Tasks.GetByID(r.Context(), wl.TaskID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "worklog not found")
		return
	}
	proj, err := h.Store.Projects.GetByID(r.Context(), task.ProjectID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "worklog not found")
		return
	}
	role, err := h.Store.Workspaces.RoleForUser(r.Context(), proj.WorkspaceID, userID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "worklog not found")
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "only managers can approve worklogs")
		return
	}
	var req setWorklogStateRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	switch req.State {
	case "approved", "rejected", "submitted", "draft":
	default:
		httpx.Error(w, http.StatusBadRequest, "validation", "invalid state")
		return
	}
	if err := h.Store.Worklogs.SetState(r.Context(), wlID, req.State); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"id": wlID, "state": req.State})
}
