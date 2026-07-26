// Package realtime broadcasts change events to connected clients.
//
// Transport is Server-Sent Events rather than WebSocket: the traffic here is
// one-directional (server → client; clients still mutate through the REST API),
// SSE needs no extra dependency, reconnects automatically in the browser, and
// survives proxies that mishandle WebSocket upgrades.
package realtime

import (
	"sync"

	"github.com/google/uuid"
)

// Event is a single change notification sent to subscribers.
type Event struct {
	// Type is the event name, e.g. "task.updated" or "chat.message".
	Type string `json:"type"`
	// ProjectID scopes the event; subscribers only receive their project.
	ProjectID uuid.UUID `json:"projectId"`
	// ActorID is who caused it, so clients can skip echoing their own action.
	ActorID uuid.UUID `json:"actorId,omitempty"`
	// Payload carries event-specific fields (ids, changed values…).
	Payload map[string]any `json:"payload,omitempty"`
}

// subscriber is one connected client stream.
type subscriber struct {
	projectID uuid.UUID
	ch        chan Event
}

// Hub fans events out to subscribers grouped by project.
type Hub struct {
	mu   sync.RWMutex
	subs map[*subscriber]struct{}
}

// NewHub creates an empty hub.
func NewHub() *Hub {
	return &Hub{subs: map[*subscriber]struct{}{}}
}

// Subscribe registers a listener for one project. The returned channel is
// buffered; unsubscribe must be called to release it.
func (h *Hub) Subscribe(projectID uuid.UUID) (<-chan Event, func()) {
	s := &subscriber{projectID: projectID, ch: make(chan Event, 16)}
	h.mu.Lock()
	h.subs[s] = struct{}{}
	h.mu.Unlock()

	return s.ch, func() {
		h.mu.Lock()
		if _, ok := h.subs[s]; ok {
			delete(h.subs, s)
			close(s.ch)
		}
		h.mu.Unlock()
	}
}

// Publish delivers an event to every subscriber of its project. Slow consumers
// are skipped rather than blocking the caller — dropping a refresh hint is
// preferable to stalling a request handler.
func (h *Hub) Publish(e Event) {
	if h == nil {
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for s := range h.subs {
		if s.projectID != e.ProjectID {
			continue
		}
		select {
		case s.ch <- e:
		default:
		}
	}
}

// Count reports how many streams are connected (used by tests/diagnostics).
func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs)
}
