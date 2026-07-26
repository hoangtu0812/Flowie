package store

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ExportData collects every record tied to a user for a GDPR data export.
// Values are returned as plain maps so the JSON mirrors the database rows
// without needing a type per table.
func (s *UserStore) ExportData(ctx context.Context, userID uuid.UUID) (map[string]any, error) {
	out := map[string]any{
		"exportedAt": time.Now().UTC(),
		"notice": "Bản xuất dữ liệu cá nhân theo GDPR. " +
			"Bao gồm hồ sơ, thành viên workspace, công việc, bình luận, worklog, thông báo và phiên đăng nhập.",
	}

	profile, err := s.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	out["profile"] = map[string]any{
		"id":          profile.ID,
		"email":       profile.Email,
		"displayName": profile.DisplayName,
		"isActive":    profile.IsActive,
		"createdAt":   profile.CreatedAt,
		"lastLoginAt": profile.LastLoginAt,
	}

	// Each entry: a label for the JSON key and the query returning its rows.
	sections := []struct {
		key   string
		query string
	}{
		{"workspaceMemberships", `
			SELECT w.name AS workspace, m.role, w.created_at
			FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id
			WHERE m.user_id = $1`},
		{"assignedTasks", `
			SELECT t.title, t.status, t.priority, p.key AS project, t.created_at
			FROM tasks t JOIN projects p ON p.id = t.project_id
			WHERE t.assignee_id = $1`},
		{"reportedTasks", `
			SELECT t.title, t.status, p.key AS project, t.created_at
			FROM tasks t JOIN projects p ON p.id = t.project_id
			WHERE t.reporter_id = $1`},
		{"comments", `
			SELECT c.body, t.title AS task, c.created_at
			FROM comments c JOIN tasks t ON t.id = c.task_id
			WHERE c.author_id = $1`},
		{"worklogs", `
			SELECT w.minutes, w.note, w.logged_on, w.source, w.state, t.title AS task
			FROM worklogs w JOIN tasks t ON t.id = w.task_id
			WHERE w.user_id = $1`},
		{"chatMessages", `
			SELECT m.body, c.name AS channel, m.created_at
			FROM chat_messages m JOIN chat_channels c ON c.id = m.channel_id
			WHERE m.author_id = $1`},
		{"notifications", `
			SELECT type, title, body, read_at, created_at
			FROM notifications WHERE user_id = $1`},
		{"sessions", `
			SELECT device, ip, last_seen, expires_at, created_at, revoked_at
			FROM user_sessions WHERE user_id = $1`},
		{"activity", `
			SELECT verb, meta, created_at
			FROM activity_events WHERE actor_id = $1`},
	}

	for _, sec := range sections {
		rows, err := s.pool.Query(ctx, sec.query, userID)
		if err != nil {
			return nil, fmt.Errorf("export %s: %w", sec.key, err)
		}
		items := []map[string]any{}
		fields := rows.FieldDescriptions()
		for rows.Next() {
			vals, err := rows.Values()
			if err != nil {
				rows.Close()
				return nil, err
			}
			item := make(map[string]any, len(fields))
			for i, f := range fields {
				item[string(f.Name)] = vals[i]
			}
			items = append(items, item)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return nil, err
		}
		out[sec.key] = items
	}
	return out, nil
}

// AnonymiseAccount scrubs personal data while keeping project history intact.
//
// Deleting the user row outright would cascade away tasks and comments the team
// still needs, so instead the identity is replaced with a placeholder and the
// account is deactivated. Authored content stays, but is no longer attributable.
func (s *UserStore) AnonymiseAccount(ctx context.Context, userID uuid.UUID) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Personal content that carries no project value is removed outright.
	for _, q := range []string{
		`DELETE FROM notifications WHERE user_id = $1`,
		`DELETE FROM user_sessions WHERE user_id = $1`,
		`DELETE FROM active_timers WHERE user_id = $1`,
		`DELETE FROM chat_reads WHERE user_id = $1`,
		`DELETE FROM team_members WHERE user_id = $1`,
		`DELETE FROM workspace_members WHERE user_id = $1`,
		`DELETE FROM project_members WHERE user_id = $1`,
		`DELETE FROM user_rates WHERE user_id = $1`,
	} {
		if _, err := tx.Exec(ctx, q, userID); err != nil {
			return err
		}
	}

	// Detach authored content so history survives without naming the person.
	for _, q := range []string{
		`UPDATE tasks SET assignee_id = NULL WHERE assignee_id = $1`,
		`UPDATE tasks SET reporter_id = NULL WHERE reporter_id = $1`,
		`UPDATE comments SET author_id = NULL WHERE author_id = $1`,
		`UPDATE chat_messages SET author_id = NULL WHERE author_id = $1`,
		`UPDATE activity_events SET actor_id = NULL WHERE actor_id = $1`,
	} {
		if _, err := tx.Exec(ctx, q, userID); err != nil {
			return err
		}
	}

	// Scrub the identity itself. The email is replaced with a unique
	// placeholder so the UNIQUE constraint still holds.
	placeholder := fmt.Sprintf("deleted-%s@anonymised.invalid", userID.String()[:8])
	if _, err := tx.Exec(ctx, `
		UPDATE users SET
		    email = $2,
		    display_name = 'Người dùng đã xoá',
		    avatar_url = '',
		    azure_oid = 'deleted|' || $1::text,
		    is_active = FALSE,
		    is_system_admin = FALSE,
		    totp_secret = '',
		    totp_enabled = FALSE,
		    recovery_codes = '[]'
		WHERE id = $1`, userID, placeholder); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
