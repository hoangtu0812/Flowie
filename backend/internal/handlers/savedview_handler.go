package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
)

// ListSavedViews returns the caller's saved views for a project.
func (h *Handlers) ListSavedViews(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	views, err := h.Store.SavedViews.ListForUser(r.Context(), proj.ID, userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"views": views})
}

type createSavedViewRequest struct {
	Name   string         `json:"name"`
	Shared bool           `json:"shared"`
	Config map[string]any `json:"config"`
}

// CreateSavedView stores the current board state under a name.
func (h *Handlers) CreateSavedView(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	var req createSavedViewRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}
	owner := &userID
	if req.Shared {
		if !canManageWorkspace(role) {
			httpx.Error(w, http.StatusForbidden, "forbidden", "chỉ owner/admin mới lưu view dùng chung")
			return
		}
		owner = nil
	}
	v, err := h.Store.SavedViews.Create(r.Context(), proj.ID, owner, req.Name, req.Config)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, v)
}

// DeleteSavedView removes a view the caller owns (or any shared one for admins).
func (h *Handlers) DeleteSavedView(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	viewID, ok := parseUUIDParam(w, r, "viewID")
	if !ok {
		return
	}
	err := h.Store.SavedViews.Delete(r.Context(), proj.ID, viewID, userID, canManageWorkspace(role))
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "view không tồn tại hoặc bạn không có quyền xoá")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
