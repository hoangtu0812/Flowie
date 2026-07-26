package store

import (
	"context"
	"errors"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// ── Custom roles (Module 1.2) ─────────────────────────────────

// ListCustomRoles returns a workspace's custom roles.
func (s *WorkspaceStore) ListCustomRoles(ctx context.Context, workspaceID uuid.UUID) ([]domain.CustomRole, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, workspace_id, name, permissions, created_at
		FROM custom_roles WHERE workspace_id = $1 ORDER BY created_at`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.CustomRole{}
	for rows.Next() {
		var r domain.CustomRole
		if err := rows.Scan(&r.ID, &r.WorkspaceID, &r.Name, &r.Permissions, &r.CreatedAt); err != nil {
			return nil, err
		}
		if r.Permissions == nil {
			r.Permissions = []domain.Permission{}
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// CreateCustomRole adds a role with an explicit permission set.
func (s *WorkspaceStore) CreateCustomRole(ctx context.Context, workspaceID uuid.UUID, name string, perms []domain.Permission) (*domain.CustomRole, error) {
	if perms == nil {
		perms = []domain.Permission{}
	}
	var r domain.CustomRole
	err := s.pool.QueryRow(ctx, `
		INSERT INTO custom_roles (workspace_id, name, permissions)
		VALUES ($1, $2, $3)
		RETURNING id, workspace_id, name, permissions, created_at`,
		workspaceID, name, perms).
		Scan(&r.ID, &r.WorkspaceID, &r.Name, &r.Permissions, &r.CreatedAt)
	if err != nil {
		return nil, err
	}
	if r.Permissions == nil {
		r.Permissions = []domain.Permission{}
	}
	return &r, nil
}

// UpdateCustomRole replaces a role's name and permission set.
func (s *WorkspaceStore) UpdateCustomRole(ctx context.Context, workspaceID, roleID uuid.UUID, name string, perms []domain.Permission) error {
	if perms == nil {
		perms = []domain.Permission{}
	}
	res, err := s.pool.Exec(ctx, `
		UPDATE custom_roles SET name = $3, permissions = $4
		WHERE id = $2 AND workspace_id = $1`, workspaceID, roleID, name, perms)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteCustomRole removes a role; members holding it fall back to their
// built-in workspace role (the FK is ON DELETE SET NULL).
func (s *WorkspaceStore) DeleteCustomRole(ctx context.Context, workspaceID, roleID uuid.UUID) error {
	res, err := s.pool.Exec(ctx,
		`DELETE FROM custom_roles WHERE id = $2 AND workspace_id = $1`, workspaceID, roleID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// AssignCustomRole attaches (or clears, when roleID is nil) a custom role on a
// workspace member.
func (s *WorkspaceStore) AssignCustomRole(ctx context.Context, workspaceID, userID uuid.UUID, roleID *uuid.UUID) error {
	res, err := s.pool.Exec(ctx, `
		UPDATE workspace_members SET custom_role_id = $3
		WHERE workspace_id = $1 AND user_id = $2`, workspaceID, userID, roleID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// PermissionsForUser returns the permission set granted by the member's custom
// role. Members without a custom role return nil, meaning "fall back to the
// built-in role checks".
func (s *WorkspaceStore) PermissionsForUser(ctx context.Context, workspaceID, userID uuid.UUID) ([]domain.Permission, error) {
	var perms []domain.Permission
	err := s.pool.QueryRow(ctx, `
		SELECT r.permissions
		FROM workspace_members m
		JOIN custom_roles r ON r.id = m.custom_role_id
		WHERE m.workspace_id = $1 AND m.user_id = $2`, workspaceID, userID).Scan(&perms)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return perms, nil
}

// ── Teams / departments (Module 1.3) ──────────────────────────

// ListTeams returns a workspace's teams with their members.
func (s *WorkspaceStore) ListTeams(ctx context.Context, workspaceID uuid.UUID) ([]domain.Team, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, workspace_id, name, created_at
		FROM teams WHERE workspace_id = $1 ORDER BY name`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	teams := []domain.Team{}
	index := map[uuid.UUID]int{}
	for rows.Next() {
		var t domain.Team
		if err := rows.Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.CreatedAt); err != nil {
			return nil, err
		}
		t.Members = []domain.TeamMember{}
		index[t.ID] = len(teams)
		teams = append(teams, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(teams) == 0 {
		return teams, nil
	}

	// Attach members in one query.
	mrows, err := s.pool.Query(ctx, `
		SELECT tm.team_id, u.id, u.display_name, u.email::text
		FROM team_members tm
		JOIN teams t ON t.id = tm.team_id
		JOIN users u ON u.id = tm.user_id
		WHERE t.workspace_id = $1
		ORDER BY u.display_name`, workspaceID)
	if err != nil {
		return nil, err
	}
	defer mrows.Close()
	for mrows.Next() {
		var teamID uuid.UUID
		var m domain.TeamMember
		if err := mrows.Scan(&teamID, &m.UserID, &m.DisplayName, &m.Email); err != nil {
			return nil, err
		}
		if i, ok := index[teamID]; ok {
			teams[i].Members = append(teams[i].Members, m)
		}
	}
	return teams, mrows.Err()
}

// CreateTeam adds a team to a workspace.
func (s *WorkspaceStore) CreateTeam(ctx context.Context, workspaceID uuid.UUID, name string) (*domain.Team, error) {
	var t domain.Team
	err := s.pool.QueryRow(ctx, `
		INSERT INTO teams (workspace_id, name) VALUES ($1, $2)
		RETURNING id, workspace_id, name, created_at`, workspaceID, name).
		Scan(&t.ID, &t.WorkspaceID, &t.Name, &t.CreatedAt)
	if err != nil {
		return nil, err
	}
	t.Members = []domain.TeamMember{}
	return &t, nil
}

// DeleteTeam removes a team (memberships cascade).
func (s *WorkspaceStore) DeleteTeam(ctx context.Context, workspaceID, teamID uuid.UUID) error {
	res, err := s.pool.Exec(ctx, `
		DELETE FROM teams WHERE id = $2 AND workspace_id = $1`, workspaceID, teamID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetTeamMember adds or removes a user from a team. The user must already be a
// member of the team's workspace.
func (s *WorkspaceStore) SetTeamMember(ctx context.Context, workspaceID, teamID, userID uuid.UUID, on bool) error {
	if !on {
		_, err := s.pool.Exec(ctx,
			`DELETE FROM team_members WHERE team_id = $1 AND user_id = $2`, teamID, userID)
		return err
	}
	res, err := s.pool.Exec(ctx, `
		INSERT INTO team_members (team_id, user_id)
		SELECT t.id, m.user_id
		FROM teams t
		JOIN workspace_members m ON m.workspace_id = t.workspace_id AND m.user_id = $3
		WHERE t.id = $2 AND t.workspace_id = $1
		ON CONFLICT DO NOTHING`, workspaceID, teamID, userID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		// Either the team is not in this workspace or the user is not a member.
		return ErrNotFound
	}
	return nil
}
