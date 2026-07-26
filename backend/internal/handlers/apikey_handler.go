package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

var validScopes = map[string]bool{"read": true, "write": true}

// ListAPIKeys returns a workspace's keys (secrets are never included).
func (h *Handlers) ListAPIKeys(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	keys, err := h.Store.APIKeys.ListByWorkspace(r.Context(), ws.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"keys": keys})
}

type createAPIKeyRequest struct {
	Name   string   `json:"name"`
	Scopes []string `json:"scopes"`
}

// CreateAPIKey issues a key. The plaintext is returned exactly once.
func (h *Handlers) CreateAPIKey(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	var req createAPIKeyRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}
	scopes := []string{}
	for _, s := range req.Scopes {
		if validScopes[s] {
			scopes = append(scopes, s)
		}
	}
	if len(scopes) == 0 {
		scopes = []string{"read"}
	}

	plaintext, err := store.GenerateAPIKey()
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "keygen_failed", err.Error())
		return
	}
	key, err := h.Store.APIKeys.Create(r.Context(), ws.ID, userID, req.Name, scopes, plaintext)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	h.audit(r, store.AuditAPIKeyCreated, key.Prefix, &ws.ID,
		map[string]any{"name": key.Name, "scopes": scopes})
	// The only time the secret leaves the server.
	httpx.JSON(w, http.StatusCreated, map[string]any{"key": key, "secret": plaintext})
}

// RevokeAPIKey disables a key.
func (h *Handlers) RevokeAPIKey(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	ws, ok := h.requireWorkspaceManager(w, r, userID)
	if !ok {
		return
	}
	keyID, ok := parseUUIDParam(w, r, "keyID")
	if !ok {
		return
	}
	if err := h.Store.APIKeys.Revoke(r.Context(), ws.ID, keyID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "key not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "revoke_failed", err.Error())
		return
	}
	h.audit(r, store.AuditAPIKeyRevoked, keyID.String(), &ws.ID, nil)
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── Public API (authenticated by key, not by session) ──

type apiKeyCtxKey struct{}

// RequireAPIKey authenticates requests with an `Authorization: Bearer flw_…`
// header (or `X-API-Key`) and puts the resolved key in the context.
func (h *Handlers) RequireAPIKey(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw := r.Header.Get("X-API-Key")
		if raw == "" {
			const bearer = "Bearer "
			if v := r.Header.Get("Authorization"); strings.HasPrefix(v, bearer) {
				raw = strings.TrimPrefix(v, bearer)
			}
		}
		resolved, err := h.Store.APIKeys.Resolve(r.Context(), raw)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "invalid_api_key", "API key không hợp lệ hoặc đã bị thu hồi")
			return
		}
		ctx := contextWithKey(r.Context(), resolved)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// APIProjects lists the workspace's projects for an API client.
func (h *Handlers) APIProjects(w http.ResponseWriter, r *http.Request) {
	key, ok := keyFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "invalid_api_key", "")
		return
	}
	projects, err := h.Store.Projects.ListByWorkspace(r.Context(), key.WorkspaceID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	if projects == nil {
		projects = []domain.Project{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"projects": projects})
}

// APITasks lists a project's tasks for an API client.
func (h *Handlers) APITasks(w http.ResponseWriter, r *http.Request) {
	key, ok := keyFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "invalid_api_key", "")
		return
	}
	projID, ok := parseUUIDParam(w, r, "projectID")
	if !ok {
		return
	}
	proj, err := h.Store.Projects.GetByID(r.Context(), projID)
	// The key is scoped to one workspace; anything else is invisible to it.
	if err != nil || proj.WorkspaceID != key.WorkspaceID {
		httpx.Error(w, http.StatusNotFound, "not_found", "project not found")
		return
	}
	tasks, err := h.Store.Tasks.ListByProjectEnriched(r.Context(), proj.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	if tasks == nil {
		tasks = []domain.TaskListItem{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"tasks": tasks})
}

type apiCreateTaskRequest struct {
	Title    string `json:"title"`
	Status   string `json:"status"`
	Priority string `json:"priority"`
}

// APICreateTask creates a task through the public API. Requires the write scope.
func (h *Handlers) APICreateTask(w http.ResponseWriter, r *http.Request) {
	key, ok := keyFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "invalid_api_key", "")
		return
	}
	if !key.HasScope("write") {
		httpx.Error(w, http.StatusForbidden, "insufficient_scope", "key này chỉ có quyền read")
		return
	}
	projID, ok := parseUUIDParam(w, r, "projectID")
	if !ok {
		return
	}
	proj, err := h.Store.Projects.GetByID(r.Context(), projID)
	if err != nil || proj.WorkspaceID != key.WorkspaceID {
		httpx.Error(w, http.StatusNotFound, "not_found", "project not found")
		return
	}
	var req apiCreateTaskRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "title is required")
		return
	}
	task, err := h.Store.Tasks.Create(r.Context(), store.CreateTaskParams{
		ProjectID: proj.ID,
		Title:     req.Title,
		Status:    req.Status,
		Priority:  req.Priority,
		// API-created tasks have no human reporter.
		ReporterID: uuid.Nil,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	h.emit(proj.ID, uuid.Nil, "task.created", map[string]any{"taskId": task.ID, "via": "api"})
	httpx.JSON(w, http.StatusCreated, task)
}
