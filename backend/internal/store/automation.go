package store

import (
	"context"
	"encoding/json"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AutomationStore handles persistence for automation rules.
type AutomationStore struct {
	pool *pgxpool.Pool
}

const automationColumns = `id, project_id, name, trigger_type, trigger_status, action_type, action_assignee_id, conditions, actions, active, created_at`

func scanRule(row interface {
	Scan(dest ...any) error
}) (*domain.AutomationRule, error) {
	var a domain.AutomationRule
	var conds, acts []byte
	err := row.Scan(&a.ID, &a.ProjectID, &a.Name, &a.TriggerType, &a.TriggerStatus,
		&a.ActionType, &a.ActionAssigneeID, &conds, &acts, &a.Active, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	a.Conditions = []domain.AutomationCondition{}
	a.Actions = []domain.AutomationAction{}
	if len(conds) > 0 {
		_ = json.Unmarshal(conds, &a.Conditions)
	}
	if len(acts) > 0 {
		_ = json.Unmarshal(acts, &a.Actions)
	}
	return &a, nil
}

// Create inserts an automation rule (v1 shape: status trigger + assign action).
func (s *AutomationStore) Create(ctx context.Context, projectID uuid.UUID, name, triggerStatus string, assignee *uuid.UUID) (*domain.AutomationRule, error) {
	actions := []domain.AutomationAction{{Type: "assign", UserID: assignee.String()}}
	raw, _ := json.Marshal(actions)
	row := s.pool.QueryRow(ctx, `
		INSERT INTO automation_rules (project_id, name, trigger_type, trigger_status, action_type, action_assignee_id, actions)
		VALUES ($1,$2,'status_changed',$3,'assign',$4,$5)
		RETURNING `+automationColumns, projectID, name, triggerStatus, assignee, raw)
	return scanRule(row)
}

// CreateV2 inserts a rule with explicit conditions and actions.
func (s *AutomationStore) CreateV2(ctx context.Context, projectID uuid.UUID, name, triggerType, triggerStatus string,
	conds []domain.AutomationCondition, acts []domain.AutomationAction) (*domain.AutomationRule, error) {
	if conds == nil {
		conds = []domain.AutomationCondition{}
	}
	if acts == nil {
		acts = []domain.AutomationAction{}
	}
	rawC, _ := json.Marshal(conds)
	rawA, _ := json.Marshal(acts)
	row := s.pool.QueryRow(ctx, `
		INSERT INTO automation_rules (project_id, name, trigger_type, trigger_status, action_type, conditions, actions)
		VALUES ($1,$2,$3,$4,'multi',$5,$6)
		RETURNING `+automationColumns, projectID, name, triggerType, triggerStatus, rawC, rawA)
	return scanRule(row)
}

// ListByProject returns all rules in a project.
func (s *AutomationStore) ListByProject(ctx context.Context, projectID uuid.UUID) ([]domain.AutomationRule, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+automationColumns+` FROM automation_rules WHERE project_id=$1 ORDER BY created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.AutomationRule{}
	for rows.Next() {
		a, err := scanRule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

// ActiveForTrigger returns active rules matching a project + trigger.
// For status triggers the status must match; other triggers ignore it.
func (s *AutomationStore) ActiveForTrigger(ctx context.Context, projectID uuid.UUID, status string) ([]domain.AutomationRule, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+automationColumns+` FROM automation_rules
		 WHERE project_id=$1 AND active
		   AND trigger_type = 'status_changed' AND trigger_status=$2`, projectID, status)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.AutomationRule{}
	for rows.Next() {
		a, err := scanRule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *a)
	}
	return out, rows.Err()
}

// Delete removes a rule, returning its project id for authorization.
func (s *AutomationStore) Delete(ctx context.Context, id uuid.UUID) (uuid.UUID, error) {
	var projectID uuid.UUID
	err := s.pool.QueryRow(ctx,
		`DELETE FROM automation_rules WHERE id=$1 RETURNING project_id`, id).Scan(&projectID)
	if err != nil {
		return uuid.Nil, ErrNotFound
	}
	return projectID, nil
}
