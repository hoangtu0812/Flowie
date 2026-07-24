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
	"github.com/go-chi/httprate"
)

// NewRouter builds the chi router with all routes and middleware.
func NewRouter(cfg *config.Config, h *handlers.Handlers, sm *auth.SessionManager) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(secureHeaders(cfg.Env != "development"))
	r.Use(httprate.LimitByIP(300, time.Minute)) // 300 req/min per IP
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
			// Dev-only: guarded inside the handler (404 outside development).
			r.Get("/dev-login", h.DevLogin)
		})

		// ── Authenticated routes ──
		r.Group(func(r chi.Router) {
			r.Use(sm.RequireAuth)

			r.Get("/me", h.Me)
			r.Get("/me/timesheet", h.MyTimesheet)
			r.Get("/me/calendar", h.MyCalendar)
			r.Get("/me/dashboard", h.Dashboard)
			r.Get("/me/notifications", h.ListNotifications)
			r.Post("/me/notifications/read", h.MarkAllNotificationsRead)
			r.Patch("/notifications/{notifID}/read", h.MarkNotificationRead)
			r.Post("/me/timesheet/submit", h.SubmitTimesheet)
			r.Patch("/worklogs/{worklogID}", h.SetWorklogState)
			r.Post("/dev-make-admin", h.DevMakeAdmin)

			r.Route("/admin", func(r chi.Router) {
				r.Get("/users", h.AdminListUsers)
				r.Post("/users/sync-azure", h.AdminSyncAzureUsers)
				r.Put("/users/{userID}", h.AdminToggleUser)
				r.Get("/workspaces", h.AdminListWorkspaces)
				r.Post("/workspaces", h.AdminCreateWorkspace)
				r.Delete("/workspaces/{workspaceID}", h.AdminDeleteWorkspace)
			})

			r.Route("/workspaces", func(r chi.Router) {
				r.Get("/", h.ListWorkspaces)
				r.Post("/", h.CreateWorkspace)

				r.Route("/{workspaceID}", func(r chi.Router) {
					r.Get("/", h.GetWorkspace)
					r.Get("/projects", h.ListProjects)
					r.Post("/projects", h.CreateProject)
					r.Get("/overview", h.WorkspaceOverview)
					r.Get("/members", h.ListMembers)
					r.Post("/members", h.AddMember)
					r.Patch("/members/{userID}", h.UpdateMember)
					r.Put("/members/{userID}/rate", h.SetMemberRate)
				})
			})

			r.Route("/projects/{projectID}", func(r chi.Router) {
				r.Get("/", h.GetProject)
				r.Get("/tasks", h.ListTasks)
				r.Post("/tasks", h.CreateTask)
				r.Get("/timesheet", h.ProjectTimesheet)
				r.Get("/labels", h.ListLabels)
				r.Post("/labels", h.CreateLabel)
				r.Get("/sprints", h.ListSprints)
				r.Post("/sprints", h.CreateSprint)
				r.Get("/stats", h.ProjectStats)
				r.Get("/overview", h.ProjectOverview)
				r.Get("/members", h.ProjectMembers)
				r.Get("/automations", h.ListAutomations)
				r.Post("/automations", h.CreateAutomation)
				r.Get("/custom-fields", h.ListCustomFields)
				r.Post("/custom-fields", h.CreateCustomField)
				r.Delete("/custom-fields/{fieldID}", h.DeleteCustomField)
			})

			r.Delete("/automations/{ruleID}", h.DeleteAutomation)

			r.Patch("/sprints/{sprintID}", h.UpdateSprint)

			r.Route("/tasks/{taskID}", func(r chi.Router) {
				r.Get("/", h.GetTask)
				r.Patch("/", h.UpdateTask)
				r.Delete("/", h.DeleteTask)
				r.Patch("/status", h.UpdateTaskStatus)
				r.Patch("/sprint", h.SetTaskSprint)
				r.Post("/comments", h.AddComment)
				r.Post("/checklist", h.AddChecklistItem)
				r.Patch("/checklist/{itemID}", h.ToggleChecklistItem)
				r.Post("/labels", h.SetTaskLabel)
				r.Get("/worklogs", h.ListTaskWorklogs)
				r.Post("/worklogs", h.LogWork)
				r.Get("/dependencies", h.ListTaskDependencies)
				r.Post("/dependencies", h.AddTaskDependency)
				r.Delete("/dependencies/{depID}", h.RemoveTaskDependency)
				r.Put("/custom-fields", h.SetTaskCustomField)
			})
		})
	})

	return r
}
