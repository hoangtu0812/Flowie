package handlers

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestChatPayloadShapePerProvider(t *testing.T) {
	// Slack expects a flat {"text": …}
	slack, err := chatPayload("slack", "hello")
	if err != nil {
		t.Fatalf("slack payload: %v", err)
	}
	var s map[string]any
	if err := json.Unmarshal(slack, &s); err != nil {
		t.Fatalf("slack payload is not valid JSON: %v", err)
	}
	if s["text"] != "hello" {
		t.Errorf("slack text = %v, want hello", s["text"])
	}
	if _, hasCard := s["@type"]; hasCard {
		t.Error("slack payload must not carry Teams MessageCard fields")
	}

	// Teams requires a MessageCard envelope, otherwise the post is rejected.
	teams, err := chatPayload("teams", "hello")
	if err != nil {
		t.Fatalf("teams payload: %v", err)
	}
	var m map[string]any
	if err := json.Unmarshal(teams, &m); err != nil {
		t.Fatalf("teams payload is not valid JSON: %v", err)
	}
	if m["@type"] != "MessageCard" {
		t.Errorf("teams @type = %v, want MessageCard", m["@type"])
	}
	if m["@context"] == nil || m["summary"] == nil {
		t.Error("teams payload must include @context and summary")
	}
	if m["text"] != "hello" {
		t.Errorf("teams text = %v, want hello", m["text"])
	}
}

func TestEventHeadlineCoversKnownEvents(t *testing.T) {
	cases := []struct {
		ev      string
		payload map[string]any
		expect  string
	}{
		{"task.created", nil, "Công việc mới"},
		{"task.commented", nil, "Bình luận mới"},
		{"task.deleted", nil, "đã bị xoá"},
		{"chat.message", nil, "Tin nhắn mới"},
		{"task.status_changed", map[string]any{"from": "todo", "to": "done"}, "todo → done"},
	}
	for _, tc := range cases {
		got := eventHeadline(tc.ev, "SAP", tc.payload)
		if !strings.Contains(got, tc.expect) {
			t.Errorf("headline(%s) = %q, want it to mention %q", tc.ev, got, tc.expect)
		}
		if !strings.Contains(got, "SAP") {
			t.Errorf("headline(%s) = %q, should name the project", tc.ev, got)
		}
	}

	// Unknown events still produce something readable rather than empty text.
	if got := eventHeadline("weird.event", "SAP", nil); got == "" || !strings.Contains(got, "SAP") {
		t.Errorf("fallback headline = %q, want a non-empty message naming the project", got)
	}
}
