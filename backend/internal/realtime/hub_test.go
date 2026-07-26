package realtime

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func recv(t *testing.T, ch <-chan Event) (Event, bool) {
	t.Helper()
	select {
	case e, ok := <-ch:
		return e, ok
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for event")
		return Event{}, false
	}
}

func TestPublishReachesProjectSubscriber(t *testing.T) {
	h := NewHub()
	project := uuid.New()

	ch, unsub := h.Subscribe(project)
	defer unsub()

	h.Publish(Event{Type: "task.created", ProjectID: project})

	got, _ := recv(t, ch)
	if got.Type != "task.created" {
		t.Errorf("Type = %q, want task.created", got.Type)
	}
}

func TestPublishIsScopedToProject(t *testing.T) {
	h := NewHub()
	mine, other := uuid.New(), uuid.New()

	ch, unsub := h.Subscribe(mine)
	defer unsub()

	// An event for a different project must not leak into this stream.
	h.Publish(Event{Type: "task.created", ProjectID: other})

	select {
	case e := <-ch:
		t.Fatalf("received event for another project: %+v", e)
	case <-time.After(100 * time.Millisecond):
	}
}

func TestUnsubscribeClosesChannelAndStopsDelivery(t *testing.T) {
	h := NewHub()
	project := uuid.New()

	ch, unsub := h.Subscribe(project)
	if h.Count() != 1 {
		t.Fatalf("Count() = %d, want 1", h.Count())
	}

	unsub()
	if h.Count() != 0 {
		t.Fatalf("Count() after unsubscribe = %d, want 0", h.Count())
	}
	if _, open := <-ch; open {
		t.Error("expected the channel to be closed after unsubscribe")
	}

	// Publishing afterwards must not panic on the closed channel.
	h.Publish(Event{Type: "task.created", ProjectID: project})
}

func TestUnsubscribeIsIdempotent(t *testing.T) {
	h := NewHub()
	_, unsub := h.Subscribe(uuid.New())
	unsub()
	unsub() // must not panic or double-close
}

func TestPublishSkipsSlowSubscriber(t *testing.T) {
	h := NewHub()
	project := uuid.New()

	_, unsub := h.Subscribe(project)
	defer unsub()

	// Overflow the 16-slot buffer; Publish must drop rather than block.
	done := make(chan struct{})
	go func() {
		for i := 0; i < 100; i++ {
			h.Publish(Event{Type: "task.updated", ProjectID: project})
		}
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Publish blocked on a slow subscriber")
	}
}

func TestPublishOnNilHubIsSafe(t *testing.T) {
	var h *Hub
	h.Publish(Event{Type: "task.created", ProjectID: uuid.New()})
}
