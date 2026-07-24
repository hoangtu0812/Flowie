package store

import (
	"context"
	"encoding/json"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
)

// ListCustomFieldDefs returns a project's custom field definitions.
func (s *TaskStore) ListCustomFieldDefs(ctx context.Context, projectID uuid.UUID) ([]domain.CustomFieldDef, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, project_id, name, field_type, options
		FROM custom_field_defs
		WHERE project_id = $1
		ORDER BY created_at`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.CustomFieldDef{}
	for rows.Next() {
		var d domain.CustomFieldDef
		var opts []byte
		if err := rows.Scan(&d.ID, &d.ProjectID, &d.Name, &d.FieldType, &opts); err != nil {
			return nil, err
		}
		if opts != nil {
			d.Options = json.RawMessage(opts)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// CreateCustomFieldDef adds a field definition to a project.
func (s *TaskStore) CreateCustomFieldDef(ctx context.Context, projectID uuid.UUID, name, fieldType string, options json.RawMessage) (*domain.CustomFieldDef, error) {
	var d domain.CustomFieldDef
	var opts []byte
	var optsArg any
	if len(options) > 0 {
		optsArg = []byte(options)
	}
	err := s.pool.QueryRow(ctx, `
		INSERT INTO custom_field_defs (project_id, name, field_type, options)
		VALUES ($1, $2, $3, $4)
		RETURNING id, project_id, name, field_type, options`,
		projectID, name, fieldType, optsArg).
		Scan(&d.ID, &d.ProjectID, &d.Name, &d.FieldType, &opts)
	if err != nil {
		return nil, err
	}
	if opts != nil {
		d.Options = json.RawMessage(opts)
	}
	return &d, nil
}

// DeleteCustomFieldDef removes a field definition (scoped to its project).
func (s *TaskStore) DeleteCustomFieldDef(ctx context.Context, projectID, fieldID uuid.UUID) error {
	res, err := s.pool.Exec(ctx,
		`DELETE FROM custom_field_defs WHERE id = $1 AND project_id = $2`, fieldID, projectID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ListCustomFieldValues returns every field definition in the task's project
// paired with the task's current value (nil when unset).
func (s *TaskStore) ListCustomFieldValues(ctx context.Context, taskID uuid.UUID) ([]domain.CustomFieldValue, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT d.id, d.name, d.field_type, d.options, v.value
		FROM custom_field_defs d
		JOIN tasks t ON t.id = $1 AND t.project_id = d.project_id
		LEFT JOIN custom_field_values v ON v.custom_field_id = d.id AND v.task_id = $1
		ORDER BY d.created_at`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.CustomFieldValue{}
	for rows.Next() {
		var v domain.CustomFieldValue
		var opts, val []byte
		if err := rows.Scan(&v.FieldID, &v.Name, &v.FieldType, &opts, &val); err != nil {
			return nil, err
		}
		if opts != nil {
			v.Options = json.RawMessage(opts)
		}
		if val != nil {
			v.Value = json.RawMessage(val)
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// SetCustomFieldValue upserts a task's value for a field. It only writes when
// the field belongs to the task's project; returns ErrNotFound otherwise.
func (s *TaskStore) SetCustomFieldValue(ctx context.Context, taskID, fieldID uuid.UUID, value json.RawMessage) error {
	res, err := s.pool.Exec(ctx, `
		INSERT INTO custom_field_values (task_id, custom_field_id, value)
		SELECT $1, d.id, $3
		FROM custom_field_defs d
		JOIN tasks t ON t.id = $1 AND t.project_id = d.project_id
		WHERE d.id = $2
		ON CONFLICT (task_id, custom_field_id) DO UPDATE SET value = EXCLUDED.value`,
		taskID, fieldID, []byte(value))
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// ClearCustomFieldValue removes a task's value for a field.
func (s *TaskStore) ClearCustomFieldValue(ctx context.Context, taskID, fieldID uuid.UUID) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM custom_field_values WHERE task_id = $1 AND custom_field_id = $2`,
		taskID, fieldID)
	return err
}
