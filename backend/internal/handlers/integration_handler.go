package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

var validProviders = map[string]bool{"slack": true, "teams": true}

// eventHeadline turns an internal event into a human sentence for chat.
func eventHeadline(evType, projectName string, payload map[string]any) string {
	switch evType {
	case "task.created":
		return fmt.Sprintf("🆕 Công việc mới trong *%s*", projectName)
	case "task.status_changed":
		return fmt.Sprintf("🔄 *%s*: trạng thái %v → %v", projectName, payload["from"], payload["to"])
	case "task.commented":
		return fmt.Sprintf("💬 Bình luận mới trong *%s*", projectName)
	case "task.deleted":
		return fmt.Sprintf("🗑️ Một công việc trong *%s* đã bị xoá", projectName)
	case "chat.message":
		return fmt.Sprintf("📨 Tin nhắn mới trong *%s*", projectName)
	default:
		return fmt.Sprintf("Flowie · %s (%s)", evType, projectName)
	}
}

// chatPayload builds the provider-specific body. Slack uses {"text": …};
// Teams' incoming webhooks expect a MessageCard.
func chatPayload(provider, text string) ([]byte, error) {
	if provider == "teams" {
		return json.Marshal(map[string]any{
			"@type":    "MessageCard",
			"@context": "https://schema.org/extensions",
			"summary":  "Flowie",
			"text":     text,
		})
	}
	return json.Marshal(map[string]any{"text": text})
}

// dispatchIntegrations posts an event to Slack/Teams. Like webhooks it runs in
// the background so a slow chat endpoint never delays the user's request.
func (h *Handlers) dispatchIntegrations(projectID uuid.UUID, evType string, payload map[string]any) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		list, err := h.Store.Integrations.ActiveForEvent(ctx, projectID, evType)
		if err != nil || len(list) == 0 {
			return
		}
		projectName := ""
		if p, err := h.Store.Projects.GetByID(ctx, projectID); err == nil {
			projectName = p.Name
		}
		text := eventHeadline(evType, projectName, payload)

		for _, in := range list {
			body, err := chatPayload(in.Provider, text)
			if err != nil {
				continue
			}
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, in.WebhookURL, bytes.NewReader(body))
			if err != nil {
				h.Store.Integrations.RecordDelivery(ctx, in.ID, 0, err.Error())
				continue
			}
			req.Header.Set("Content-Type", "application/json")
			resp, err := webhookClient.Do(req)
			if err != nil {
				h.Store.Integrations.RecordDelivery(ctx, in.ID, 0, err.Error())
				continue
			}
			resp.Body.Close()
			msg := ""
			if resp.StatusCode >= 300 {
				msg = "non-2xx response"
			}
			h.Store.Integrations.RecordDelivery(ctx, in.ID, resp.StatusCode, msg)
		}
	}()
}

// ListIntegrations returns a project's chat integrations.
func (h *Handlers) ListIntegrations(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "requires workspace owner or admin")
		return
	}
	list, err := h.Store.Integrations.ListByProject(r.Context(), proj.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"integrations": list})
}

type createIntegrationRequest struct {
	Provider   string   `json:"provider"`
	WebhookURL string   `json:"webhookUrl"`
	Events     []string `json:"events"`
}

// CreateIntegration connects a Slack or Teams incoming webhook.
func (h *Handlers) CreateIntegration(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "requires workspace owner or admin")
		return
	}
	var req createIntegrationRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.Provider = strings.ToLower(strings.TrimSpace(req.Provider))
	if !validProviders[req.Provider] {
		httpx.Error(w, http.StatusBadRequest, "validation", "provider must be slack or teams")
		return
	}
	u, err := url.Parse(strings.TrimSpace(req.WebhookURL))
	if err != nil || u.Scheme != "https" || u.Host == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "webhookUrl phải là URL https hợp lệ")
		return
	}
	in, err := h.Store.Integrations.Create(r.Context(), proj.ID, req.Provider, u.String(), req.Events)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, in)
}

// DeleteIntegration removes a chat integration.
func (h *Handlers) DeleteIntegration(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "requires workspace owner or admin")
		return
	}
	id, ok := parseUUIDParam(w, r, "integrationID")
	if !ok {
		return
	}
	if err := h.Store.Integrations.Delete(r.Context(), proj.ID, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "integration not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}
