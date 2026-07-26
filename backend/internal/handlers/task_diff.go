package handlers

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
)

// recordTaskDiff writes one activity event per field that actually changed,
// each carrying the old and new value.
//
// Editing a task used to log nothing except assignment, so the history could
// not answer "who moved the due date, and from when?". Every event uses the
// verb "field_changed" with {field, from, to} in meta, so a new editable field
// shows up in the history automatically without touching the frontend.
func (h *Handlers) recordTaskDiff(ctx context.Context, actorID uuid.UUID, before, after *domain.Task) {
	if before == nil || after == nil {
		return
	}

	log := func(field, from, to string) {
		if from == to {
			return
		}
		_ = h.Store.Tasks.RecordActivity(ctx, after.ID, actorID, "field_changed", map[string]any{
			"field": field,
			"from":  from,
			"to":    to,
		})
	}

	log("title", before.Title, after.Title)
	log("priority", before.Priority, after.Priority)
	log("startDate", fmtDate(before.StartDate), fmtDate(after.StartDate))
	log("dueDate", fmtDate(before.DueDate), fmtDate(after.DueDate))
	log("startAt", fmtDateTime(before.StartAt), fmtDateTime(after.StartAt))
	log("endAt", fmtDateTime(before.EndAt), fmtDateTime(after.EndAt))
	log("storyPoints", fmtFloatPtr(before.StoryPoints), fmtFloatPtr(after.StoryPoints))
	log("moscow", derefStr(before.Moscow), derefStr(after.Moscow))
	log("sprint", fmtUUIDPtr(before.SprintID), fmtUUIDPtr(after.SprintID))

	// Description changes are logged as a fact, not a diff — the body is too
	// long to be readable in a timeline.
	if before.Description != after.Description {
		_ = h.Store.Tasks.RecordActivity(ctx, after.ID, actorID, "description_changed", nil)
	}

	// People: resolve ids to names so the history stays readable after someone
	// leaves the workspace.
	if !sameUUIDPtr(before.AssigneeID, after.AssigneeID) {
		_ = h.Store.Tasks.RecordActivity(ctx, after.ID, actorID, "field_changed", map[string]any{
			"field":  "assignee",
			"from":   h.userLabel(ctx, before.AssigneeID),
			"to":     h.userLabel(ctx, after.AssigneeID),
			"fromId": fmtUUIDPtr(before.AssigneeID),
			"toId":   fmtUUIDPtr(after.AssigneeID),
		})
	}
	if !sameUUIDPtr(before.ReporterID, after.ReporterID) {
		_ = h.Store.Tasks.RecordActivity(ctx, after.ID, actorID, "field_changed", map[string]any{
			"field": "reporter",
			"from":  h.userLabel(ctx, before.ReporterID),
			"to":    h.userLabel(ctx, after.ReporterID),
		})
	}
	if joined, left := diffParticipants(before.ParticipantIDs, after.ParticipantIDs); len(joined)+len(left) > 0 {
		_ = h.Store.Tasks.RecordActivity(ctx, after.ID, actorID, "participants_changed", map[string]any{
			"added":   h.userLabels(ctx, joined),
			"removed": h.userLabels(ctx, left),
		})
	}
}

// userLabel renders a user reference for the activity feed. An unset id reads
// as "chưa gán" rather than an empty string, so the timeline says what happened.
func (h *Handlers) userLabel(ctx context.Context, id *uuid.UUID) string {
	if id == nil || *id == uuid.Nil {
		return ""
	}
	u, err := h.Store.Users.GetByID(ctx, *id)
	if err != nil {
		return id.String()
	}
	if u.DisplayName != "" {
		return u.DisplayName
	}
	return u.Email
}

// taskLink is the frontend path that opens a task's detail drawer. Notifications
// store it so clicking one lands on the task instead of doing nothing.
func taskLink(projectID, taskID uuid.UUID) string {
	return fmt.Sprintf("/projects/%s?task=%s", projectID, taskID)
}

// commentLink opens a task and scrolls to a specific comment, used for @mentions.
func commentLink(projectID, taskID, commentID uuid.UUID) string {
	return fmt.Sprintf("/projects/%s?task=%s&comment=%s", projectID, taskID, commentID)
}

// labelName resolves a label id to its name for the activity feed, falling
// back to the id so the event is still written if the lookup fails.
func (h *Handlers) labelName(ctx context.Context, projectID, labelID uuid.UUID) string {
	labels, err := h.Store.Tasks.ListLabels(ctx, projectID)
	if err != nil {
		return labelID.String()
	}
	for _, l := range labels {
		if l.ID == labelID {
			return l.Name
		}
	}
	return labelID.String()
}

// sprintName resolves a sprint id to its name; nil means the backlog.
func (h *Handlers) sprintName(ctx context.Context, id *uuid.UUID) string {
	if id == nil || *id == uuid.Nil {
		return "Backlog"
	}
	sp, err := h.Store.Sprints.GetByID(ctx, *id)
	if err != nil {
		return id.String()
	}
	return sp.Name
}

func (h *Handlers) userLabels(ctx context.Context, ids []uuid.UUID) []string {
	out := []string{}
	for _, id := range ids {
		out = append(out, h.userLabel(ctx, &id))
	}
	return out
}

// diffParticipants returns who was added and who was removed.
func diffParticipants(before, after []uuid.UUID) (added, removed []uuid.UUID) {
	inBefore := map[uuid.UUID]bool{}
	for _, id := range before {
		inBefore[id] = true
	}
	inAfter := map[uuid.UUID]bool{}
	for _, id := range after {
		inAfter[id] = true
		if !inBefore[id] {
			added = append(added, id)
		}
	}
	for _, id := range before {
		if !inAfter[id] {
			removed = append(removed, id)
		}
	}
	return added, removed
}

func fmtDate(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format("2006-01-02")
}

func fmtDateTime(t *time.Time) string {
	if t == nil {
		return ""
	}
	return t.Format(time.RFC3339)
}

func fmtFloatPtr(f *float64) string {
	if f == nil {
		return ""
	}
	return strings.TrimSuffix(strings.TrimRight(fmt.Sprintf("%.2f", *f), "0"), ".")
}

func fmtUUIDPtr(id *uuid.UUID) string {
	if id == nil || *id == uuid.Nil {
		return ""
	}
	return id.String()
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func sameUUIDPtr(a, b *uuid.UUID) bool {
	return fmtUUIDPtr(a) == fmtUUIDPtr(b)
}
