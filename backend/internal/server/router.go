// Package server wires configuration, middleware and handlers into an
// http.Server.
package server

import (
	"net/http"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/config"
	"github.com/flowie/backend/internal/handlers"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// NewRouter builds the chi router with all routes and middleware.
func NewRouter(cfg *config.Config, h *handlers.Handlers, sm *auth.SessionManager) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.FrontendURL},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/healthz", h.Health)

	r.Route("/api/v1", func(r chi.Router) {
		// ── Public auth routes ──
		r.Route("/auth", func(r chi.Router) {
			r.Get("/azure/login", h.AzureLogin)
			r.Get("/azure/callback", h.AzureCallback)
			r.Post("/logout", h.Logout)
		})

		// ── Authenticated routes ──
		r.Group(func(r chi.Router) {
			r.Use(sm.RequireAuth)

			r.Get("/me", h.Me)

			r.Route("/workspaces", func(r chi.Router) {
				r.Get("/", h.ListWorkspaces)
				r.Post("/", h.CreateWorkspace)

				r.Route("/{workspaceID}", func(r chi.Router) {
					r.Get("/", h.GetWorkspace)
					r.Get("/projects", h.ListProjects)
					r.Post("/projects", h.CreateProject)
				})
			})

			r.Route("/projects/{projectID}", func(r chi.Router) {
				r.Get("/", h.GetProject)
				r.Get("/tasks", h.ListTasks)
				r.Post("/tasks", h.CreateTask)
			})

			r.Patch("/tasks/{taskID}/status", h.UpdateTaskStatus)
		})
	})

	return r
}
