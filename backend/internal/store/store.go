// Package store implements data access on top of a pgx connection pool.
package store

import (
	"errors"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a queried row does not exist.
var ErrNotFound = errors.New("not found")

// ErrInviteEmailMismatch is returned when an invite link is redeemed by someone
// other than the address it was issued to.
var ErrInviteEmailMismatch = errors.New("invite was issued to a different email")

// Store is the aggregate repository handle.
type Store struct {
	pool *pgxpool.Pool

	Users         *UserStore
	Workspaces    *WorkspaceStore
	Projects      *ProjectStore
	Tasks         *TaskStore
	Sprints       *SprintStore
	Worklogs      *WorklogStore
	Notifications *NotificationStore
	Automations   *AutomationStore
	Chat          *ChatStore
	Sessions      *SessionStore
	Webhooks      *WebhookStore
	Dashboards    *DashboardStore
	APIKeys       *APIKeyStore
	Integrations  *IntegrationStore
	SavedViews    *SavedViewStore
	Audit         *AuditStore
	Reports       *ReportStore
	Attachments   *AttachmentStore
	Invites       *InviteStore
}

// New builds a Store from a pgx pool.
func New(pool *pgxpool.Pool) *Store {
	return &Store{
		pool:          pool,
		Users:         &UserStore{pool: pool},
		Workspaces:    &WorkspaceStore{pool: pool},
		Projects:      &ProjectStore{pool: pool},
		Tasks:         &TaskStore{pool: pool},
		Sprints:       &SprintStore{pool: pool},
		Worklogs:      &WorklogStore{pool: pool},
		Notifications: &NotificationStore{pool: pool},
		Automations:   &AutomationStore{pool: pool},
		Chat:          &ChatStore{pool: pool},
		Sessions:      &SessionStore{pool: pool},
		Webhooks:      &WebhookStore{pool: pool},
		Dashboards:    &DashboardStore{pool: pool},
		APIKeys:       &APIKeyStore{pool: pool},
		Integrations:  &IntegrationStore{pool: pool},
		SavedViews:    &SavedViewStore{pool: pool},
		Audit:         &AuditStore{pool: pool},
		Reports:       &ReportStore{pool: pool},
		Attachments:   &AttachmentStore{pool: pool},
		Invites:       &InviteStore{pool: pool},
	}
}
