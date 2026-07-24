package handlers

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/storage/sharepoint"
	"github.com/flowie/backend/internal/store"
	"github.com/flowie/backend/internal/util"
)

type createProjectRequest struct {
	Name        string `json:"name"`
	Key         string `json:"key"`
	Description string `json:"description"`
}

// CreateProject creates a project inside a workspace and provisions its
// SharePoint folder tree (project folder + standard subfolders).
func (h *Handlers) CreateProject(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, role, ok := h.requireWorkspaceMember(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot create projects")
		return
	}

	var req createProjectRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Key = strings.ToUpper(strings.TrimSpace(req.Key))
	if req.Name == "" || req.Key == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name and key are required")
		return
	}

	proj, err := h.Store.Projects.Create(r.Context(), store.CreateProjectParams{
		WorkspaceID: ws.ID,
		Name:        req.Name,
		Key:         req.Key,
		Description: req.Description,
		CreatedBy:   userID,
	})
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "key_taken", "project key already used in this workspace")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}

	// Provision SharePoint project folder + standard subfolders (best-effort).
	if h.SharePoint != nil {
		h.provisionProjectFolder(r, ws.Slug, proj)
	}

	httpx.JSON(w, http.StatusCreated, proj)
}

// provisionProjectFolder creates the project folder and its default subfolders.
func (h *Handlers) provisionProjectFolder(r *http.Request, workspaceSlug string, proj *domain.Project) {
	projectSlug := proj.Key + "-" + util.Slugify(proj.Name)
	base := h.SharePoint.ProjectFolder(workspaceSlug, projectSlug)

	item, err := h.SharePoint.EnsureFolder(r.Context(), base)
	if err != nil {
		slog.Error("provision project folder", "project", proj.ID, "error", err)
		return
	}
	for _, sub := range sharepoint.DefaultProjectSubfolders {
		if _, err := h.SharePoint.EnsureFolder(r.Context(), base+"/"+sub); err != nil {
			slog.Error("provision project subfolder", "project", proj.ID, "sub", sub, "error", err)
		}
	}
	if err := h.Store.Projects.SetSharePointFolder(r.Context(), proj.ID, base, item.ID); err == nil {
		proj.SharePointFolderPath = base
	}
}

// ListProjects returns the projects in a workspace.
func (h *Handlers) ListProjects(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, _, ok := h.requireWorkspaceMember(w, r, userID)
	if !ok {
		return
	}
	items, err := h.Store.Projects.ListByWorkspace(r.Context(), ws.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	if items == nil {
		items = []domain.Project{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"projects": items})
}

// GetProject returns a single project the caller can access.
func (h *Handlers) GetProject(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	httpx.JSON(w, http.StatusOK, proj)
}
