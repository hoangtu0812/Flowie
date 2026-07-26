package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

// validWidgetTypes lists the widget kinds the frontend can render.
var validWidgetTypes = map[string]bool{
	"kpi":           true,
	"status_donut":  true,
	"priority_bar":  true,
	"trend":         true,
	"project_table": true,
	"velocity":      true,
}

// ListDashboards returns the caller's dashboards in a workspace.
func (h *Handlers) ListDashboards(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, _, ok := h.requireWorkspaceMember(w, r, userID)
	if !ok {
		return
	}
	list, err := h.Store.Dashboards.ListForUser(r.Context(), ws.ID, userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"dashboards": list})
}

type createDashboardRequest struct {
	Name   string `json:"name"`
	Shared bool   `json:"shared"`
}

// CreateDashboard adds a personal or shared dashboard.
func (h *Handlers) CreateDashboard(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, role, ok := h.requireWorkspaceMember(w, r, userID)
	if !ok {
		return
	}
	var req createDashboardRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}
	// Only owners/admins may publish a dashboard to the whole workspace.
	owner := &userID
	if req.Shared {
		if !canManageWorkspace(role) {
			httpx.Error(w, http.StatusForbidden, "forbidden", "chỉ owner/admin mới tạo dashboard dùng chung")
			return
		}
		owner = nil
	}
	d, err := h.Store.Dashboards.CreateDashboard(r.Context(), ws.ID, owner, req.Name)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, d)
}

// requireDashboardAccess verifies the caller belongs to the dashboard's workspace.
func (h *Handlers) requireDashboardAccess(w http.ResponseWriter, r *http.Request, userID uuid.UUID) (uuid.UUID, bool) {
	dashID, ok := parseUUIDParam(w, r, "dashboardID")
	if !ok {
		return uuid.Nil, false
	}
	wsID, err := h.Store.Dashboards.DashboardWorkspace(r.Context(), dashID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "dashboard not found")
		return uuid.Nil, false
	}
	if _, err := h.Store.Workspaces.RoleForUser(r.Context(), wsID, userID); err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "dashboard not found")
		return uuid.Nil, false
	}
	return dashID, true
}

// DeleteDashboard removes a dashboard.
func (h *Handlers) DeleteDashboard(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	dashID, ok := h.requireDashboardAccess(w, r, userID)
	if !ok {
		return
	}
	wsID, _ := h.Store.Dashboards.DashboardWorkspace(r.Context(), dashID)
	if err := h.Store.Dashboards.DeleteDashboard(r.Context(), wsID, dashID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "dashboard not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

type addWidgetRequest struct {
	Type   string         `json:"type"`
	Title  string         `json:"title"`
	Config map[string]any `json:"config"`
	Width  int            `json:"width"`
}

// AddWidget appends a widget to a dashboard.
func (h *Handlers) AddWidget(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	dashID, ok := h.requireDashboardAccess(w, r, userID)
	if !ok {
		return
	}
	var req addWidgetRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if !validWidgetTypes[req.Type] {
		httpx.Error(w, http.StatusBadRequest, "validation", "unknown widget type: "+req.Type)
		return
	}
	if req.Width < 1 || req.Width > 3 {
		req.Width = 1
	}
	wdg, err := h.Store.Dashboards.AddWidget(r.Context(), dashID, req.Type,
		strings.TrimSpace(req.Title), req.Config, req.Width)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, wdg)
}

// DeleteWidget removes a widget.
func (h *Handlers) DeleteWidget(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	dashID, ok := h.requireDashboardAccess(w, r, userID)
	if !ok {
		return
	}
	widgetID, ok := parseUUIDParam(w, r, "widgetID")
	if !ok {
		return
	}
	if err := h.Store.Dashboards.DeleteWidget(r.Context(), dashID, widgetID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "widget not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
