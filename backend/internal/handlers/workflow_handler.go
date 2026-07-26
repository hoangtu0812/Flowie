package handlers

import (
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
)

var statusKeyRe = regexp.MustCompile(`^[a-z0-9_]{1,32}$`)

var validCategories = map[string]bool{
	"todo": true, "in_progress": true, "done": true,
}

const defaultStatusColor = "#3b82f6"

var hexColorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

// Colours used to be one of six palette names. They are now free-form hex so
// the UI can offer a real colour picker; the old names stay valid so existing
// projects keep rendering.
var legacyStatusColors = map[string]bool{
	"blue": true, "purple": true, "orange": true,
	"green": true, "red": true, "gray": true,
}

func validStatusColor(c string) bool {
	return hexColorRe.MatchString(c) || legacyStatusColors[c]
}

// ListStatuses returns a project's board columns.
func (h *Handlers) ListStatuses(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	statuses, err := h.Store.Tasks.ListStatuses(r.Context(), proj.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"statuses": statuses})
}

type createStatusRequest struct {
	Key      string `json:"key"`
	Name     string `json:"name"`
	Category string `json:"category"`
	Color    string `json:"color"`
	WIPLimit *int   `json:"wipLimit"`
}

// CreateStatus adds a board column to a project.
func (h *Handlers) CreateStatus(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "requires workspace owner or admin")
		return
	}
	var req createStatusRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Key = strings.TrimSpace(strings.ToLower(req.Key))
	if req.Key == "" {
		// Derive a key from the name: "On Hold" → "on_hold".
		req.Key = strings.ToLower(strings.ReplaceAll(req.Name, " ", "_"))
		req.Key = regexp.MustCompile(`[^a-z0-9_]`).ReplaceAllString(req.Key, "")
	}
	if req.Name == "" || !statusKeyRe.MatchString(req.Key) {
		httpx.Error(w, http.StatusBadRequest, "validation",
			"name is required and key must match [a-z0-9_]{1,32}")
		return
	}
	if req.Category == "" {
		req.Category = "todo"
	}
	if !validCategories[req.Category] {
		httpx.Error(w, http.StatusBadRequest, "validation", "category must be todo, in_progress or done")
		return
	}
	if req.Color == "" {
		req.Color = defaultStatusColor
	}
	if !validStatusColor(req.Color) {
		httpx.Error(w, http.StatusBadRequest, "validation",
			"color must be a hex value like #3b82f6")
		return
	}
	if req.WIPLimit != nil && *req.WIPLimit < 0 {
		httpx.Error(w, http.StatusBadRequest, "validation", "wipLimit must be >= 0")
		return
	}

	st, err := h.Store.Tasks.CreateStatus(r.Context(), proj.ID, req.Key, req.Name, req.Category, req.Color, req.WIPLimit)
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "status_exists", "key already used in this project")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, st)
}

type updateStatusRequest struct {
	Name     *string  `json:"name"`
	Category *string  `json:"category"`
	Color    *string  `json:"color"`
	Position *float64 `json:"position"`
	WIPLimit *int     `json:"wipLimit"` // null clears the limit
	ClearWIP bool     `json:"clearWip"` // explicit "remove limit"
}

// UpdateStatus patches a board column.
func (h *Handlers) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "requires workspace owner or admin")
		return
	}
	statusID, ok := parseUUIDParam(w, r, "statusID")
	if !ok {
		return
	}
	var req updateStatusRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if req.Category != nil && !validCategories[*req.Category] {
		httpx.Error(w, http.StatusBadRequest, "validation", "invalid category")
		return
	}
	if req.Color != nil && !validStatusColor(*req.Color) {
		httpx.Error(w, http.StatusBadRequest, "validation",
			"color must be a hex value like #3b82f6")
		return
	}
	f := store.StatusUpdateFields{
		Name: req.Name, Category: req.Category, Color: req.Color, Position: req.Position,
	}
	if req.ClearWIP {
		f.SetWIPLimit = true
		f.WIPLimit = nil
	} else if req.WIPLimit != nil {
		f.SetWIPLimit = true
		f.WIPLimit = req.WIPLimit
	}
	if err := h.Store.Tasks.UpdateWorkflowStatus(r.Context(), proj.ID, statusID, f); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "status not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// DeleteStatus removes a board column, moving its tasks to the first column.
func (h *Handlers) DeleteStatus(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "requires workspace owner or admin")
		return
	}
	statusID, ok := parseUUIDParam(w, r, "statusID")
	if !ok {
		return
	}
	if err := h.Store.Tasks.DeleteStatus(r.Context(), proj.ID, statusID); err != nil {
		switch {
		case errors.Is(err, store.ErrLastStatus):
			httpx.Error(w, http.StatusConflict, "last_status", "không thể xoá cột cuối cùng")
		case errors.Is(err, store.ErrNotFound):
			httpx.Error(w, http.StatusNotFound, "not_found", "status not found")
		default:
			httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		}
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// checkWIPLimit reports whether moving a task into statusKey would exceed the
// column's WIP limit. Returns the limit and the current count when it would.
func (h *Handlers) checkWIPLimit(r *http.Request, proj *domain.Project, statusKey string) (exceeded bool, limit, count int) {
	lim, err := h.Store.Tasks.WIPLimitFor(r.Context(), proj.ID, statusKey)
	if err != nil || lim == nil || *lim <= 0 {
		return false, 0, 0
	}
	n, err := h.Store.Tasks.CountTasksInStatus(r.Context(), proj.ID, statusKey)
	if err != nil {
		return false, 0, 0
	}
	if n >= *lim {
		return true, *lim, n
	}
	return false, *lim, n
}
