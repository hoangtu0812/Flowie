package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/httpx"
	"github.com/flowie/backend/internal/realtime"
	"github.com/google/uuid"
)

// heartbeat keeps proxies from closing an idle SSE connection.
const sseHeartbeat = 25 * time.Second

// ProjectEvents streams live change events for a project over SSE.
func (h *Handlers) ProjectEvents(w http.ResponseWriter, r *http.Request) {
	userID, _ := auth.UserID(r.Context())
	proj, _, ok := h.requireProjectAccess(w, r, userID)
	if !ok {
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		httpx.Error(w, http.StatusInternalServerError, "streaming_unsupported", "server cannot stream")
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	// Disable proxy buffering (nginx) so events arrive immediately.
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	events, unsubscribe := h.Hub.Subscribe(proj.ID)
	defer unsubscribe()

	// Tell the client the stream is live before any real event arrives.
	fmt.Fprintf(w, "event: ready\ndata: {\"projectId\":%q}\n\n", proj.ID.String())
	flusher.Flush()

	ticker := time.NewTicker(sseHeartbeat)
	defer ticker.Stop()

	ctx := r.Context()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Comment frame: ignored by EventSource, keeps the socket warm.
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		case ev, open := <-events:
			if !open {
				return
			}
			payload, err := json.Marshal(ev)
			if err != nil {
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, payload)
			flusher.Flush()
		}
	}
}

// publish is a convenience wrapper used by mutating handlers.
func (h *Handlers) publish(projectID, actorID uuid.UUID, evType string, payload map[string]any) {
	if h.Hub == nil {
		return
	}
	h.Hub.Publish(realtime.Event{
		Type:      evType,
		ProjectID: projectID,
		ActorID:   actorID,
		Payload:   payload,
	})
}
