package handlers

import (
	"net/http"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

type createTaskRequest struct {
	Title        string     `json:"title"`
	Description  string     `json:"description"`
	Status       string     `json:"status"`
	Priority     string     `json:"priority"`
	AssigneeID   *uuid.UUID `json:"assigneeId"`
	ParentTaskID *uuid.UUID `json:"parentTaskId"`
}

// CreateTask creates a task within a project.
func (h *Handlers) CreateTask(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot create tasks")
		return
	}

	var req createTaskRequest
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
		ProjectID:    proj.ID,
		ParentTaskID: req.ParentTaskID,
		Title:        req.Title,
		Description:  req.Description,
		Status:       req.Status,
		Priority:     req.Priority,
		AssigneeID:   req.AssigneeID,
		ReporterID:   userID,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, task)
}

// ListTasks returns all tasks in a project (grouped client-side by status).
func (h *Handlers) ListTasks(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	items, err := h.Store.Tasks.ListByProject(r.Context(), proj.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	if items == nil {
		items = []domain.Task{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"tasks": items})
}

type updateTaskStatusRequest struct {
	Status string `json:"status"`
}

// UpdateTaskStatus moves a task to a different status column (Kanban drag/drop).
func (h *Handlers) UpdateTaskStatus(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	taskID, ok := parseUUIDParam(w, r, "taskID")
	if !ok {
		return
	}

	task, err := h.Store.Tasks.GetByID(r.Context(), taskID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "task not found")
		return
	}
	// Access control via the task's project.
	proj, err := h.Store.Projects.GetByID(r.Context(), task.ProjectID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "task not found")
		return
	}
	if _, err := h.Store.Workspaces.RoleForUser(r.Context(), proj.WorkspaceID, userID); err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "task not found")
		return
	}

	var req updateTaskStatusRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Status = strings.TrimSpace(req.Status)
	if req.Status == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "status is required")
		return
	}

	updated, err := h.Store.Tasks.UpdateStatus(r.Context(), taskID, req.Status)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, updated)
}
