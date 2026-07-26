package store

import (
	"context"
	"encoding/json"

	"github.com/flowie/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// DashboardStore persists custom dashboards and their widgets.
type DashboardStore struct {
	pool *pgxpool.Pool
}

// ListForUser returns the workspace's dashboards visible to a user: their own
// plus any shared (owner-less) ones.
func (s *DashboardStore) ListForUser(ctx context.Context, workspaceID, userID uuid.UUID) ([]domain.Dashboard, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, workspace_id, owner_id, name, created_at
		FROM dashboards
		WHERE workspace_id = $1 AND (owner_id IS NULL OR owner_id = $2)
		ORDER BY created_at`, workspaceID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := []domain.Dashboard{}
	index := map[uuid.UUID]int{}
	for rows.Next() {
		var d domain.Dashboard
		if err := rows.Scan(&d.ID, &d.WorkspaceID, &d.OwnerID, &d.Name, &d.CreatedAt); err != nil {
			return nil, err
		}
		d.Widgets = []domain.DashboardWidget{}
		d.Shared = d.OwnerID == nil
		index[d.ID] = len(out)
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return out, nil
	}

	// Attach widgets in one query.
	wrows, err := s.pool.Query(ctx, `
		SELECT w.id, w.dashboard_id, w.type, w.title, w.config, w.position, w.width
		FROM dashboard_widgets w
		JOIN dashboards d ON d.id = w.dashboard_id
		WHERE d.workspace_id = $1 AND (d.owner_id IS NULL OR d.owner_id = $2)
		ORDER BY w.position`, workspaceID, userID)
	if err != nil {
		return nil, err
	}
	defer wrows.Close()
	for wrows.Next() {
		var wdg domain.DashboardWidget
		var cfg []byte
		if err := wrows.Scan(&wdg.ID, &wdg.DashboardID, &wdg.Type, &wdg.Title,
			&cfg, &wdg.Position, &wdg.Width); err != nil {
			return nil, err
		}
		wdg.Config = map[string]any{}
		if len(cfg) > 0 {
			_ = json.Unmarshal(cfg, &wdg.Config)
		}
		if i, ok := index[wdg.DashboardID]; ok {
			out[i].Widgets = append(out[i].Widgets, wdg)
		}
	}
	return out, wrows.Err()
}

// CreateDashboard adds a dashboard. Pass a nil owner to share it workspace-wide.
func (s *DashboardStore) CreateDashboard(ctx context.Context, workspaceID uuid.UUID, owner *uuid.UUID, name string) (*domain.Dashboard, error) {
	var d domain.Dashboard
	err := s.pool.QueryRow(ctx, `
		INSERT INTO dashboards (workspace_id, owner_id, name)
		VALUES ($1, $2, $3)
		RETURNING id, workspace_id, owner_id, name, created_at`,
		workspaceID, owner, name).
		Scan(&d.ID, &d.WorkspaceID, &d.OwnerID, &d.Name, &d.CreatedAt)
	if err != nil {
		return nil, err
	}
	d.Widgets = []domain.DashboardWidget{}
	d.Shared = d.OwnerID == nil
	return &d, nil
}

// DeleteDashboard removes a dashboard within a workspace.
func (s *DashboardStore) DeleteDashboard(ctx context.Context, workspaceID, id uuid.UUID) error {
	res, err := s.pool.Exec(ctx,
		`DELETE FROM dashboards WHERE id = $1 AND workspace_id = $2`, id, workspaceID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// DashboardWorkspace returns the workspace a dashboard belongs to, for access checks.
func (s *DashboardStore) DashboardWorkspace(ctx context.Context, id uuid.UUID) (uuid.UUID, error) {
	var ws uuid.UUID
	if err := s.pool.QueryRow(ctx,
		`SELECT workspace_id FROM dashboards WHERE id = $1`, id).Scan(&ws); err != nil {
		return uuid.Nil, ErrNotFound
	}
	return ws, nil
}

// AddWidget appends a widget to a dashboard.
func (s *DashboardStore) AddWidget(ctx context.Context, dashboardID uuid.UUID, wType, title string, config map[string]any, width int) (*domain.DashboardWidget, error) {
	if config == nil {
		config = map[string]any{}
	}
	raw, _ := json.Marshal(config)
	var wdg domain.DashboardWidget
	var cfg []byte
	err := s.pool.QueryRow(ctx, `
		INSERT INTO dashboard_widgets (dashboard_id, type, title, config, position, width)
		VALUES ($1, $2, $3, $4,
		        COALESCE((SELECT MAX(position)+1 FROM dashboard_widgets WHERE dashboard_id=$1), 0),
		        $5)
		RETURNING id, dashboard_id, type, title, config, position, width`,
		dashboardID, wType, title, raw, width).
		Scan(&wdg.ID, &wdg.DashboardID, &wdg.Type, &wdg.Title, &cfg, &wdg.Position, &wdg.Width)
	if err != nil {
		return nil, err
	}
	wdg.Config = map[string]any{}
	if len(cfg) > 0 {
		_ = json.Unmarshal(cfg, &wdg.Config)
	}
	return &wdg, nil
}

// DeleteWidget removes a widget from a dashboard.
func (s *DashboardStore) DeleteWidget(ctx context.Context, dashboardID, widgetID uuid.UUID) error {
	res, err := s.pool.Exec(ctx,
		`DELETE FROM dashboard_widgets WHERE id = $1 AND dashboard_id = $2`, widgetID, dashboardID)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}
