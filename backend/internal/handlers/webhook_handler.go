package handlers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/store"
	"github.com/google/uuid"
)

// webhookClient has a short timeout: a slow endpoint must not tie up a worker.
var webhookClient = &http.Client{Timeout: 10 * time.Second}

// signPayload returns the hex HMAC-SHA256 of body using secret.
func signPayload(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

// dispatchWebhooks delivers an event to every matching endpoint.
//
// Runs in its own goroutine with a background context: the user's request has
// already been answered, so delivery must not extend or fail it.
func (h *Handlers) dispatchWebhooks(projectID, actorID uuid.UUID, eventType string, payload map[string]any) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		defer cancel()

		hooks, err := h.Store.Webhooks.ActiveForEvent(ctx, projectID, eventType)
		if err != nil || len(hooks) == 0 {
			return
		}
		body, err := json.Marshal(map[string]any{
			"type":      eventType,
			"projectId": projectID,
			"actorId":   actorID,
			"payload":   payload,
			"sentAt":    time.Now().UTC(),
		})
		if err != nil {
			return
		}

		for _, wh := range hooks {
			req, err := http.NewRequestWithContext(ctx, http.MethodPost, wh.URL, bytes.NewReader(body))
			if err != nil {
				h.Store.Webhooks.RecordDelivery(ctx, wh.ID, 0, err.Error())
				continue
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("User-Agent", "Flowie-Webhook/1")
			req.Header.Set("X-Flowie-Event", eventType)
			if wh.Secret != "" {
				req.Header.Set("X-Flowie-Signature", "sha256="+signPayload(wh.Secret, body))
			}

			resp, err := webhookClient.Do(req)
			if err != nil {
				h.Store.Webhooks.RecordDelivery(ctx, wh.ID, 0, err.Error())
				slog.Warn("webhook delivery failed", "url", wh.URL, "err", err)
				continue
			}
			resp.Body.Close()
			msg := ""
			if resp.StatusCode >= 300 {
				msg = "non-2xx response"
			}
			h.Store.Webhooks.RecordDelivery(ctx, wh.ID, resp.StatusCode, msg)
		}
	}()
}

// ListWebhooks returns a project's webhooks (secrets are never included).
func (h *Handlers) ListWebhooks(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "requires workspace owner or admin")
		return
	}
	hooks, err := h.Store.Webhooks.ListByProject(r.Context(), proj.ID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "list_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"webhooks": hooks})
}

type createWebhookRequest struct {
	URL    string   `json:"url"`
	Events []string `json:"events"`
	Secret string   `json:"secret"`
}

// CreateWebhook registers an outgoing webhook for a project.
func (h *Handlers) CreateWebhook(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "requires workspace owner or admin")
		return
	}
	var req createWebhookRequest
	if err := httpx.Decode(r, &req); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid_body", err.Error())
		return
	}
	req.URL = strings.TrimSpace(req.URL)
	u, err := url.Parse(req.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		httpx.Error(w, http.StatusBadRequest, "validation", "url must be a valid http(s) URL")
		return
	}
	hook, err := h.Store.Webhooks.Create(r.Context(), proj.ID, req.URL, req.Events, strings.TrimSpace(req.Secret))
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "create_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusCreated, hook)
}

// DeleteWebhook removes a webhook.
func (h *Handlers) DeleteWebhook(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, role, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}
	if !canManageWorkspace(role) {
		httpx.Error(w, http.StatusForbidden, "forbidden", "requires workspace owner or admin")
		return
	}
	hookID, ok := parseUUIDParam(w, r, "webhookID")
	if !ok {
		return
	}
	if err := h.Store.Webhooks.Delete(r.Context(), proj.ID, hookID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			httpx.Error(w, http.StatusNotFound, "not_found", "webhook not found")
			return
		}
		httpx.Error(w, http.StatusInternalServerError, "delete_failed", err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

// emit fans an event out to every consumer: live UI streams, raw webhooks and
// chat integrations. All outbound delivery is asynchronous.
func (h *Handlers) emit(projectID, actorID uuid.UUID, evType string, payload map[string]any) {
	h.publish(projectID, actorID, evType, payload)
	h.dispatchWebhooks(projectID, actorID, evType, payload)
	h.dispatchIntegrations(projectID, evType, payload)
}
