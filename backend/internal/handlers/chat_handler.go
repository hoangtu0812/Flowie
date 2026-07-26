package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/google/uuid"
)

// requireChannelAccess resolves the channel in the "channelID" URL param and
// verifies the caller belongs to its project's workspace.
func (h *Handlers) requireChannelAccess(w http.ResponseWriter, r *http.Request, userID uuid.UUID) (uuid.UUID, domain.WorkspaceRole, bool) {
	channelID, ok := parseUUIDParam(w, r, "channelID")
	if !ok {
		return uuid.Nil, "", false
	}
	projectID, err := h.Store.Chat.ChannelProject(r.Context(), channelID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "channel not found")
		return uuid.Nil, "", false
	}
	proj, err := h.Store.Projects.GetByID(r.Context(), projectID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "channel not found")
		return uuid.Nil, "", false
	}
	role, err := h.Store.Workspaces.RoleForUser(r.Context(), proj.WorkspaceID, userID)
	if err != nil {
		httpx.Error(w, http.StatusNotFound, "not_found", "channel not found")
		return uuid.Nil, "", false
	}
	return channelID, role, true
}

// ListChannels returns a project's chat channels with unread counts.
func (h *Handlers) ListChannels(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	channels, err := h.Store.Chat.ListChannels(r.Context(), proj.ID, userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"channels": channels})
}

type createChannelRequest struct {
	Name string `json:"name"`
}

// CreateChannel adds a chat channel to a project.
func (h *Handlers) CreateChannel(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot create channels")
		return
	}
	var req createChannelRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "name is required")
		return
	}
	ch, err := h.Store.Chat.CreateChannel(r.Context(), proj.ID, req.Name)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, ch)
}

// DeleteChannel removes a channel.
func (h *Handlers) DeleteChannel(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	channelID, role, ok := h.requireChannelAccess(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "requires workspace owner or admin")
		return
	}
	if err := h.Store.Chat.DeleteChannel(r.Context(), channelID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ListMessages returns a channel's recent messages and marks it read.
func (h *Handlers) ListMessages(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	channelID, _, ok := h.requireChannelAccess(w, r, userID)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	msgs, err := h.Store.Chat.ListMessages(r.Context(), channelID, limit)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	_ = h.Store.Chat.MarkRead(r.Context(), channelID, userID)
	httpx.JSON(w, http.StatusOK, map[string]any{"messages": msgs})
}

type postMessageRequest struct {
	Body string `json:"body"`
}

// PostMessage appends a message to a channel and notifies @mentioned members.
func (h *Handlers) PostMessage(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	channelID, role, ok := h.requireChannelAccess(w, r, userID)
	if !ok {
		return
	}
	if role == domain.WorkspaceRoleGuest {
		httpx.Error(w, http.StatusForbidden, "forbidden", "guests cannot post messages")
		return
	}
	var req postMessageRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Body = strings.TrimSpace(req.Body)
	if req.Body == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "body is required")
		return
	}
	msg, err := h.Store.Chat.PostMessage(r.Context(), channelID, userID, req.Body)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "post_failed", err.Error())
		return
	}
	_ = h.Store.Chat.MarkRead(r.Context(), channelID, userID)
	h.notifyChatMentions(r, channelID, req.Body, userID)
	if projectID, err := h.Store.Chat.ChannelProject(r.Context(), channelID); err == nil {
		h.publish(projectID, userID, "chat.message",
			map[string]any{"channelId": channelID, "messageId": msg.ID})
	}
	httpx.JSON(w, http.StatusCreated, msg)
}

// MarkChannelRead resets the caller's unread counter for a channel.
func (h *Handlers) MarkChannelRead(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	channelID, _, ok := h.requireChannelAccess(w, r, userID)
	if !ok {
		return
	}
	if err := h.Store.Chat.MarkRead(r.Context(), channelID, userID); err != nil {
		httpx.Error(w, http.StatusInternalServerError, "update_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// notifyChatMentions sends a notification to workspace members @mentioned in a
// chat message, reusing the same token matching as task comments.
func (h *Handlers) notifyChatMentions(r *http.Request, channelID uuid.UUID, body string, authorID uuid.UUID) {
	tokens := parseMentions(body)
	if len(tokens) == 0 {
		return
	}
	projectID, err := h.Store.Chat.ChannelProject(r.Context(), channelID)
	if err != nil {
		return
	}
	proj, err := h.Store.Projects.GetByID(r.Context(), projectID)
	if err != nil {
		return
	}
	members, err := h.Store.Workspaces.ListMembers(r.Context(), proj.WorkspaceID)
	if err != nil {
		return
	}
	for _, m := range members {
		if m.UserID == authorID {
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
				"Bạn được nhắc đến trong chat", proj.Name, nil,
				fmt.Sprintf("/projects/%s/chat", proj.ID))
		}
	}
}
