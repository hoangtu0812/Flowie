package store

import (
	"context"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AutomationStore handles persistence for automation rules.
type AutomationStore struct {
	pool *pgxpool.Pool
}

const automationColumns = `id, project_id, name, trigger_status, action_type, action_assignee_id, active, created_at`

func scanRule(row interface {
	Scan(dest ...any) error
}) (*domain.AutomationRule, error) {
	var a domain.AutomationRule
	err := row.Scan(&a.ID, &a.ProjectID, &a.Name, &a.TriggerStatus, &a.ActionType,
		&a.ActionAssigneeID, &a.Active, &a.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// Create inserts an automation rule.
func (s *AutomationStore) Create(ctx context.Context, projectID uuid.UUID, name, triggerStatus string, assignee *uuid.UUID) (*domain.AutomationRule, error) {
	row := s.pool.QueryRow(ctx, `
		INSERT INTO automation_rules (project_id, name, trigger_status, action_type, action_assignee_id)
		VALUES ($1,$2,$3,'assign',$4)
		RETURNING `+automationColumns, projectID, name, triggerStatus, assignee)
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

// ActiveForTrigger returns active rules matching a project + status trigger.
func (s *AutomationStore) ActiveForTrigger(ctx context.Context, projectID uuid.UUID, status string) ([]domain.AutomationRule, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT `+automationColumns+` FROM automation_rules
		 WHERE project_id=$1 AND active AND trigger_status=$2`, projectID, status)
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
