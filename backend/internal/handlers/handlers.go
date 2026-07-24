// Package handlers implements the HTTP handlers for the Flowie API.
package handlers

import (
	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/config"
	"github.com/flowie/backend/internal/storage/sharepoint"
	"github.com/flowie/backend/internal/store"
)

// Handlers bundles the dependencies shared by all HTTP handlers.
type Handlers struct {
	Cfg        *config.Config
	Store      *store.Store
	Sessions   *auth.SessionManager
	Azure      *auth.AzureProvider
	SharePoint *sharepoint.Client // may be nil if not configured
}

// New builds a Handlers value.
func New(cfg *config.Config, st *store.Store, sm *auth.SessionManager, az *auth.AzureProvider, sp *sharepoint.Client) *Handlers {
	return &Handlers{Cfg: cfg, Store: st, Sessions: sm, Azure: az, SharePoint: sp}
}
