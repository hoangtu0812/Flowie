package handlers

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

// mentionRe matches @email or @word tokens in a comment body.
var mentionRe = regexp.MustCompile(`@([\w.+\-]+@[\w.\-]+|[\w]+)`)

// parseMentions extracts lowercased @mention tokens from text.
func parseMentions(body string) map[string]bool {
	out := map[string]bool{}
	for _, m := range mentionRe.FindAllStringSubmatch(body, -1) {
		out[strings.ToLower(m[1])] = true
	}
	return out
}

// notifyMentions notifies workspace members mentioned in a comment body.
func (h *Handlers) notifyMentions(r *http.Request, task *domain.Task, body string, notified map[uuid.UUID]bool, commentID uuid.UUID) {
	tokens := parseMentions(body)
	if len(tokens) == 0 {
		return
	}
	proj, err := h.Store.Projects.GetByID(r.Context(), task.ProjectID)
	if err != nil {
		return
	}
	members, err := h.Store.Workspaces.ListMembers(r.Context(), proj.WorkspaceID)
	if err != nil {
		return
	}
	for _, m := range members {
		if notified[m.UserID] {
			continue
		}
		email := strings.ToLower(m.Email)
		local := email
		if i := strings.IndexByte(email, '@'); i > 0 {
			local = email[:i]
		}
		first := ""
		if fs := strings.Fields(m.DisplayName); len(fs) > 0 {
			first = strings.ToLower(fs[0])
		}
		if tokens[email] || tokens[local] || (first != "" && tokens[first]) {
			_ = h.Store.Notifications.Create(r.Context(), m.UserID, "mentioned",
				"Bạn được nhắc đến trong một bình luận", task.Title, &task.ID,
				commentLink(task.ProjectID, task.ID, commentID))
			notified[m.UserID] = true
		}
	}
}

type createTaskRequest struct {
	Title          string      `json:"title"`
	Description    string      `json:"description"`
	Status         string      `json:"status"`
	Priority       string      `json:"priority"`
	AssigneeID     *uuid.UUID  `json:"assigneeId"`
	ParentTaskID   *uuid.UUID  `json:"parentTaskId"`
	ParticipantIDs []uuid.UUID `json:"participantIds"`
}

// CreateTask creates a task within a project.
func (h *Handlers) CreateTask(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if !h.requirePermission(w, r, proj.WorkspaceID, userID, role, "task.create") {
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
		ProjectID:      proj.ID,
		ParentTaskID:   req.ParentTaskID,
		Title:          req.Title,
		Description:    req.Description,
		Status:         req.Status,
		Priority:       req.Priority,
		AssigneeID:     req.AssigneeID,
		ReporterID:     userID,
		ParticipantIDs: req.ParticipantIDs,
	})
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, userID, "created", map[string]any{"title": task.Title})
	h.emit(proj.ID, userID, "task.created", map[string]any{"taskId": task.ID})
	httpx.JSON(w, http.StatusCreated, task)
}

// DeleteTask removes a task.
func (h *Handlers) DeleteTask(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, role, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	proj, err := h.Store.Projects.GetByID(r.Context(), task.ProjectID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "project not found")
		return
	}
	if !h.requirePermission(w, r, proj.WorkspaceID, userID, role, "task.delete") {
		return
	}
	if err := h.Store.Tasks.Delete(r.Context(), task.ID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	h.emit(task.ProjectID, userID, "task.deleted", map[string]any{"taskId": task.ID})
	httpx.JSON(w, http.StatusNoContent, nil)
}

// ListTasks returns all tasks in a project, enriched with labels + counts.
func (h *Handlers) ListTasks(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	items, err := h.Store.Tasks.ListByProjectEnriched(r.Context(), proj.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	if items == nil {
		items = []domain.TaskListItem{}
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"tasks": items})
}

type updateTaskStatusRequest struct {
	Status string `json:"status"`
}

// UpdateTaskStatus moves a task to a different status column (Kanban drag/drop).
func (h *Handlers) UpdateTaskStatus(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, _, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
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

	// Enforce the target column's WIP limit (only when actually moving).
	if task.Status != req.Status {
		if proj, err := h.Store.Projects.GetByID(r.Context(), task.ProjectID); err == nil {
			if over, limit, count := h.checkWIPLimit(r, proj, req.Status); over {
				httpx.Error(w, http.StatusConflict, "wip_limit_exceeded",
					fmt.Sprintf("cột này giới hạn %d công việc (hiện có %d)", limit, count))
				return
			}
		}
	}

	updated, err := h.Store.Tasks.UpdateStatus(r.Context(), task.ID, req.Status)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	if task.Status != req.Status {
		_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, userID, "status_changed",
			map[string]any{"from": task.Status, "to": req.Status})
		h.runAutomations(r, updated, userID)
		h.emit(task.ProjectID, userID, "task.status_changed",
			map[string]any{"taskId": task.ID, "from": task.Status, "to": req.Status})
	}
	httpx.JSON(w, http.StatusOK, updated)
}

// GetTask returns full task detail: the task plus comments, checklist,
// activity and the project's available labels.
func (h *Handlers) GetTask(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, _, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	comments, _ := h.Store.Tasks.ListComments(r.Context(), task.ID)
	checklist, _ := h.Store.Tasks.ListChecklist(r.Context(), task.ID)
	activity, _ := h.Store.Tasks.ListActivity(r.Context(), task.ID)
	labels, _ := h.Store.Tasks.ListLabels(r.Context(), task.ProjectID)
	dependencies, _ := h.Store.Tasks.ListDependencies(r.Context(), task.ID)
	customFields, _ := h.Store.Tasks.ListCustomFieldValues(r.Context(), task.ID)
	httpx.JSON(w, http.StatusOK, map[string]any{
		"task":         task,
		"comments":     comments,
		"checklist":    checklist,
		"activity":     activity,
		"labels":       labels,
		"dependencies": dependencies,
		"customFields": customFields,
	})
}

type updateTaskRequest struct {
	Title          *string   `json:"title"`
	Description    *string   `json:"description"`
	Priority       *string   `json:"priority"`
	StoryPoints    *float64  `json:"storyPoints"`
	StartDate      *string   `json:"startDate"` // "YYYY-MM-DD" or "" to clear
	DueDate        *string   `json:"dueDate"`
	AssigneeID     *string   `json:"assigneeId"` // uuid, or "" to unassign
	ReporterID     *string   `json:"reporterId"` // uuid, or "" to unassign
	ParticipantIDs *[]string `json:"participantIds"`
	StartAt        *string   `json:"startAt"` // datetime, or "" to clear
	EndAt          *string   `json:"endAt"`

	// Backlog prioritisation (Module 3.2)
	Moscow         *string  `json:"moscow"` // "" clears
	RiceReach      *float64 `json:"riceReach"`
	RiceImpact     *float64 `json:"riceImpact"`
	RiceConfidence *float64 `json:"riceConfidence"`
	RiceEffort     *float64 `json:"riceEffort"`
}

// validMoscow lists the accepted MoSCoW buckets.
var validMoscow = map[string]bool{"must": true, "should": true, "could": true, "wont": true}

// UpdateTask patches editable task fields.
func (h *Handlers) UpdateTask(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, role, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	if proj, pErr := h.Store.Projects.GetByID(r.Context(), task.ProjectID); pErr == nil {
		if !h.requirePermission(w, r, proj.WorkspaceID, userID, role, "task.edit") {
			return
		}
	}
	var req updateTaskRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	f := store.TaskUpdateFields{Title: req.Title, Description: req.Description, Priority: req.Priority}
	if req.StoryPoints != nil {
		f.SetStoryPoints = true
		f.StoryPoints = req.StoryPoints
	}
	if req.StartDate != nil {
		if d, ok := parseDate(*req.StartDate); ok {
			f.SetStartDate = true
			f.StartDate = d
		}
	}
	if req.DueDate != nil {
		if d, ok := parseDate(*req.DueDate); ok {
			f.SetDueDate = true
			f.DueDate = d
		}
	}
	if req.AssigneeID != nil {
		f.SetAssignee = true
		if *req.AssigneeID != "" {
			if aid, err := uuid.Parse(*req.AssigneeID); err == nil {
				f.AssigneeID = &aid
			}
		}
	}
	if req.ReporterID != nil {
		f.SetReporter = true
		if *req.ReporterID != "" {
			if rid, err := uuid.Parse(*req.ReporterID); err == nil {
				f.ReporterID = &rid
			}
		}
	}
	if req.ParticipantIDs != nil {
		f.SetParticipants = true
		for _, pidStr := range *req.ParticipantIDs {
			if uid, err := uuid.Parse(pidStr); err == nil {
				f.ParticipantIDs = append(f.ParticipantIDs, uid)
			}
		}
	}
	if req.StartAt != nil {
		if d, ok := parseDateTime(*req.StartAt); ok {
			f.SetStartAt = true
			f.StartAt = d
		}
	}
	if req.EndAt != nil {
		if d, ok := parseDateTime(*req.EndAt); ok {
			f.SetEndAt = true
			f.EndAt = d
		}
	}
	if req.Moscow != nil {
		m := strings.ToLower(strings.TrimSpace(*req.Moscow))
		if m != "" && !validMoscow[m] {
			httpx.Error(w, http.StatusBadRequest, "validation", "moscow must be must, should, could or wont")
			return
		}
		f.SetMoscow = true
		if m != "" {
			f.Moscow = &m
		}
	}
	// RICE inputs travel together so the generated score stays consistent.
	if req.RiceReach != nil || req.RiceImpact != nil || req.RiceConfidence != nil || req.RiceEffort != nil {
		f.SetRice = true
		f.RiceReach, f.RiceImpact = req.RiceReach, req.RiceImpact
		f.RiceConfidence, f.RiceEffort = req.RiceConfidence, req.RiceEffort
	}
	updated, err := h.Store.Tasks.Update(r.Context(), task.ID, f)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	// `task` is the pre-update snapshot, so the diff can report from → to for
	// every field, not just the assignee.
	h.recordTaskDiff(r.Context(), userID, task, updated)

	if req.AssigneeID != nil && f.AssigneeID != nil && *f.AssigneeID != userID {
		_ = h.Store.Notifications.Create(r.Context(), *f.AssigneeID, "assigned",
			"Bạn được giao một công việc", task.Title, &task.ID, taskLink(task.ProjectID, task.ID))
	}
	h.emit(task.ProjectID, userID, "task.updated", map[string]any{"taskId": task.ID})
	httpx.JSON(w, http.StatusOK, updated)
}

type addCommentRequest struct {
	Body string `json:"body"`
}

// AddComment posts a comment on a task.
func (h *Handlers) AddComment(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, _, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	var req addCommentRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "body is required")
		return
	}
	c, err := h.Store.Tasks.AddComment(r.Context(), task.ID, userID, req.Body)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "comment_failed", err.Error())
		return
	}
	_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, userID, "commented", nil)

	notified := map[uuid.UUID]bool{userID: true}
	// Notify the assignee (if any, and not the commenter).
	if task.AssigneeID != nil && !notified[*task.AssigneeID] {
		_ = h.Store.Notifications.Create(r.Context(), *task.AssigneeID, "commented",
			"Bình luận mới trên công việc của bạn", task.Title, &task.ID,
			commentLink(task.ProjectID, task.ID, c.ID))
		notified[*task.AssigneeID] = true
	}
	// Notify @mentioned members.
	h.notifyMentions(r, task, req.Body, notified, c.ID)
	h.emit(task.ProjectID, userID, "task.commented", map[string]any{"taskId": task.ID})

	httpx.JSON(w, http.StatusCreated, c)
}

type checklistRequest struct {
	Title string `json:"title"`
	Done  *bool  `json:"done"`
}

// AddChecklistItem appends a checklist item.
func (h *Handlers) AddChecklistItem(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, _, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	var req checklistRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Title = strings.TrimSpace(req.Title)
	if req.Title == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "title is required")
		return
	}
	item, err := h.Store.Tasks.AddChecklistItem(r.Context(), task.ID, req.Title)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "checklist_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, item)
}

// ToggleChecklistItem flips a checklist item's done state.
func (h *Handlers) ToggleChecklistItem(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	if _, _, ok := h.requireTaskAccess(w, r, userID); !ok {
		return
	}
	itemID, ok := parseUUIDParam(w, r, "itemID")
	if !ok {
		return
	}
	var req checklistRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	done := req.Done != nil && *req.Done
	if err := h.Store.Tasks.ToggleChecklistItem(r.Context(), itemID, done); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"id": itemID, "done": done})
}

// ── Labels ──

// ListLabels returns a project's labels.
func (h *Handlers) ListLabels(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	labels, err := h.Store.Tasks.ListLabels(r.Context(), proj.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"labels": labels})
}

type createLabelRequest struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// CreateLabel adds a label to a project.
func (h *Handlers) CreateLabel(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	var req createLabelRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}
	if req.Color == "" {
		req.Color = "primary"
	}
	l, err := h.Store.Tasks.CreateLabel(r.Context(), proj.ID, req.Name, req.Color)
	if err != nil {
		if isUniqueViolation(err) {
			httpx.Error(w, http.StatusConflict, "label_exists", "label name already used")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, l)
}

type setLabelRequest struct {
	LabelID uuid.UUID `json:"labelId"`
	On      bool      `json:"on"`
}

// SetTaskLabel adds/removes a label on a task.
func (h *Handlers) SetTaskLabel(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	task, _, ok := h.requireTaskAccess(w, r, userID)
	if !ok {
		return
	}
	var req setLabelRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	if err := h.Store.Tasks.SetTaskLabel(r.Context(), task.ID, req.LabelID, req.On); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	verb := "label_removed"
	if req.On {
		verb = "label_added"
	}
	_ = h.Store.Tasks.RecordActivity(r.Context(), task.ID, userID, verb, map[string]any{
		"label": h.labelName(r.Context(), task.ProjectID, req.LabelID),
	})
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
