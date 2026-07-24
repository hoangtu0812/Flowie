package handlers

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/flowie/backend/internal/util"
)

type createWorkspaceRequest struct {
	Name string `json:"name"`
}

// CreateWorkspace creates a workspace, makes the caller its owner, and (if
// SharePoint is configured) provisions the workspace's root folder.
func (h *Handlers) CreateWorkspace(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())

	var req createWorkspaceRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}

	slug := util.Slugify(req.Name)
	ws, err := h.Store.Workspaces.Create(r.Context(), req.Name, slug, userID)
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "slug_taken", "a workspace with a similar name exists")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}

	// Provision SharePoint folder (best-effort; failure must not block creation).
	if h.SharePoint != nil {
		folderPath := h.SharePoint.WorkspaceFolder(ws.Slug)
		if item, err := h.SharePoint.EnsureFolder(r.Context(), folderPath); err != nil {
			slog.Error("provision workspace folder", "workspace", ws.ID, "error", err)
		} else {
			if err := h.Store.Workspaces.SetSharePointFolder(r.Context(), ws.ID, folderPath, item.ID); err == nil {
				ws.SharePointFolderPath = folderPath
			}
		}
	}

	httpx.JSON(w, http.StatusCreated, ws)
}

// ListWorkspaces returns the workspaces the caller belongs to.
func (h *Handlers) ListWorkspaces(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	items, err := h.Store.Workspaces.ListForUser(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	if items == nil {
		items = []domain.Workspace{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"workspaces": items})
}

// GetWorkspace returns a workspace the caller can access.
func (h *Handlers) GetWorkspace(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, _, ok := h.requireWorkspaceMember(w, r, userID)
	if !ok {
		return
	}
	httpx.JSON(w, http.StatusOK, ws)
}

// isUniqueViolation reports whether err is a Postgres unique-constraint error.
func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE 23505")
}

// notFound centralises ErrNotFound handling.
func notFound(err error) bool { return errors.Is(err, store.ErrNotFound) }
