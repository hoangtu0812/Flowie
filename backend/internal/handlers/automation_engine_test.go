package handlers

import (
	"testing"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
)

func ptrF(f float64) *float64 { return &f }
func ptrS(s string) *string   { return &s }

func TestEvalCondition(t *testing.T) {
	assignee := uuid.New()
	task := &domain.Task{
		Status:      "in_review",
		Priority:    "high",
		AssigneeID:  &assignee,
		StoryPoints: ptrF(5),
		Moscow:      ptrS("must"),
	}
	unassigned := &domain.Task{Status: "todo", Priority: "low"}

	cases := []struct {
		name string
		task *domain.Task
		cond domain.AutomationCondition
		want bool
	}{
		{"eq matches", task, domain.AutomationCondition{Field: "priority", Op: "eq", Value: "high"}, true},
		{"eq is case-insensitive", task, domain.AutomationCondition{Field: "priority", Op: "eq", Value: "HIGH"}, true},
		{"eq mismatch", task, domain.AutomationCondition{Field: "priority", Op: "eq", Value: "low"}, false},
		{"neq mismatch is true", task, domain.AutomationCondition{Field: "priority", Op: "neq", Value: "low"}, true},
		{"status eq", task, domain.AutomationCondition{Field: "status", Op: "eq", Value: "in_review"}, true},
		{"assignee not_empty", task, domain.AutomationCondition{Field: "assignee", Op: "not_empty"}, true},
		{"assignee is_empty on unassigned", unassigned, domain.AutomationCondition{Field: "assignee", Op: "is_empty"}, true},
		{"assignee is_empty on assigned", task, domain.AutomationCondition{Field: "assignee", Op: "is_empty"}, false},
		{"story_points gt", task, domain.AutomationCondition{Field: "story_points", Op: "gt", Value: "3"}, true},
		{"story_points lt", task, domain.AutomationCondition{Field: "story_points", Op: "lt", Value: "3"}, false},
		{"moscow eq", task, domain.AutomationCondition{Field: "moscow", Op: "eq", Value: "must"}, true},
		{"unknown field never matches", task, domain.AutomationCondition{Field: "nope", Op: "eq", Value: "x"}, false},
		{"unknown op never matches", task, domain.AutomationCondition{Field: "priority", Op: "weird", Value: "high"}, false},
		// A missing numeric value must not be treated as zero.
		{"gt on empty story_points", unassigned, domain.AutomationCondition{Field: "story_points", Op: "gt", Value: "0"}, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := evalCondition(tc.task, tc.cond); got != tc.want {
				t.Errorf("evalCondition(%+v) = %v, want %v", tc.cond, got, tc.want)
			}
		})
	}
}

func TestConditionsMet(t *testing.T) {
	task := &domain.Task{Status: "in_review", Priority: "high"}

	t.Run("empty list always matches", func(t *testing.T) {
		if !conditionsMet(task, nil) {
			t.Error("expected empty conditions to match")
		}
	})

	t.Run("all must pass (AND)", func(t *testing.T) {
		conds := []domain.AutomationCondition{
			{Field: "status", Op: "eq", Value: "in_review"},
			{Field: "priority", Op: "eq", Value: "high"},
		}
		if !conditionsMet(task, conds) {
			t.Error("expected all-matching conditions to pass")
		}
	})

	t.Run("one failure rejects", func(t *testing.T) {
		conds := []domain.AutomationCondition{
			{Field: "status", Op: "eq", Value: "in_review"},
			{Field: "priority", Op: "eq", Value: "low"},
		}
		if conditionsMet(task, conds) {
			t.Error("expected a failing condition to reject the rule")
		}
	})
}

func TestTaskFieldValue(t *testing.T) {
	empty := &domain.Task{}
	for _, field := range []string{"assignee", "story_points", "moscow"} {
		if _, present := taskFieldValue(empty, field); present {
			t.Errorf("field %q should report absent on an empty task", field)
		}
	}
	if v, present := taskFieldValue(&domain.Task{Priority: "low"}, "priority"); !present || v != "low" {
		t.Errorf("priority = (%q,%v), want (low,true)", v, present)
	}
}
