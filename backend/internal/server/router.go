// Package server wires configuration, middleware and handlers into an
// http.Server.
package server

import (
	"net/http"
	"strings"
	"time"

	"github.com/flowie/backend/internal/auth"
	"github.com/flowie/backend/internal/config"
	"github.com/flowie/backend/internal/handlers"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"
)

// isStreamingPath reports whether a request is a long-lived stream that must
// not be subject to the global request timeout.
func isStreamingPath(r *http.Request) bool {
	return strings.HasSuffix(r.URL.Path, "/events")
}

// timeoutExcept applies a request timeout to every request except those the
// skip predicate matches.
func timeoutExcept(d time.Duration, skip func(*http.Request) bool) func(http.Handler) http.Handler {
	timeout := middleware.Timeout(d)
	return func(next http.Handler) http.Handler {
		withTimeout := timeout(next)
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if skip(r) {
				next.ServeHTTP(w, r)
				return
			}
			withTimeout.ServeHTTP(w, r)
		})
	}
}

// NewRouter builds the chi router with all routes and middleware.
func NewRouter(cfg *config.Config, h *handlers.Handlers, sm *auth.SessionManager) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(secureHeaders(cfg.Env != "development"))
	r.Use(httprate.LimitByIP(300, time.Minute)) // 300 req/min per IP
	// Streaming endpoints must outlive the request timeout, otherwise the SSE
	// connection is torn down every 30s.
	r.Use(timeoutExcept(30*time.Second, isStreamingPath))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.FrontendURL},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/healthz", h.Health)

	// Public API for third-party integrations. Authenticated by workspace API
	// key rather than a session cookie, so it lives outside /api/v1.
	// Inbound SCM webhooks (GitHub/GitLab). Machine-to-machine: authenticated
	// by a per-project secret in the query string, not a session.
	r.Post("/api/scm/v1/projects/{projectID}/webhook", h.SCMWebhook)

	r.Route("/api/public/v1", func(r chi.Router) {
		r.Use(h.RequireAPIKey)
		r.Get("/projects", h.APIProjects)
		r.Get("/projects/{projectID}/tasks", h.APITasks)
		r.Post("/projects/{projectID}/tasks", h.APICreateTask)
	})

	r.Route("/api/v1", func(r chi.Router) {
		// ── Public auth routes ──
		r.Route("/auth", func(r chi.Router) {
			r.Get("/azure/login", h.AzureLogin)
			r.Get("/azure/callback", h.AzureCallback)
			r.Post("/logout", h.Logout)
			// Completes an MFA challenge; reads the pending token itself
			// because RequireAuth rejects half-authenticated sessions.
			r.Post("/2fa/verify", h.VerifyTwoFactor)
			// Dev-only: guarded inside the handler (404 outside development).
			r.Get("/dev-login", h.DevLogin)
		})

		// ── Authenticated routes ──
		r.Group(func(r chi.Router) {
			r.Use(sm.RequireAuth)

			r.Get("/me", h.Me)
			// GDPR: data portability + erasure
			r.Get("/me/export", h.ExportMyData)
			r.Post("/me/delete", h.DeleteMyData)
			r.Get("/me/2fa", h.TwoFactorStatus)
			r.Post("/me/2fa/start", h.StartTwoFactor)
			r.Post("/me/2fa/enable", h.EnableTwoFactor)
			r.Post("/me/2fa/disable", h.DisableTwoFactor)
			r.Post("/me/session/refresh", h.RefreshSession)
			r.Get("/me/sessions", h.ListSessions)
			r.Delete("/me/sessions/{sessionID}", h.RevokeSession)
			r.Post("/invites/accept", h.AcceptInvite)
			r.Get("/permissions", h.ListPermissions)
			r.Get("/me/timer", h.GetActiveTimer)
			r.Post("/me/timer/stop", h.StopTimer)
			r.Delete("/me/timer", h.CancelTimer)
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
				r.Get("/audit-log", h.AdminAuditLog)
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
					r.Get("/invites", h.ListInvites)
					r.Post("/invites", h.CreateInvite)
					r.Delete("/invites/{inviteID}", h.RevokeInvite)
					r.Get("/audit-log", h.ListAuditLog)
					r.Get("/reports", h.ListReports)
					r.Post("/reports", h.CreateReport)
					r.Delete("/reports/{reportID}", h.DeleteReport)
					r.Post("/reports/{reportID}/run", h.RunReportNow)
					r.Get("/api-keys", h.ListAPIKeys)
					r.Post("/api-keys", h.CreateAPIKey)
					r.Delete("/api-keys/{keyID}", h.RevokeAPIKey)
					r.Get("/dashboards", h.ListDashboards)
					r.Post("/dashboards", h.CreateDashboard)
					r.Get("/members", h.ListMembers)
					r.Post("/members", h.AddMember)
					r.Patch("/members/{userID}", h.UpdateMember)
					r.Put("/members/{userID}/rate", h.SetMemberRate)
					r.Put("/members/{userID}/custom-role", h.AssignCustomRole)

					r.Get("/roles", h.ListCustomRoles)
					r.Post("/roles", h.CreateCustomRole)
					r.Put("/roles/{roleID}", h.UpdateCustomRole)
					r.Delete("/roles/{roleID}", h.DeleteCustomRole)

					r.Get("/teams", h.ListTeams)
					r.Post("/teams", h.CreateTeam)
					r.Delete("/teams/{teamID}", h.DeleteTeam)
					r.Post("/teams/{teamID}/members", h.SetTeamMember)
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
				r.Get("/velocity", h.ProjectVelocity)
				r.Get("/critical-path", h.ProjectCriticalPath)
				r.Get("/members", h.ProjectMembers)
				r.Get("/automations", h.ListAutomations)
				r.Post("/automations", h.CreateAutomation)
				r.Post("/automations/v2", h.CreateAutomationV2)
				r.Get("/events", h.ProjectEvents)
				r.Get("/integrations", h.ListIntegrations)
				r.Post("/integrations", h.CreateIntegration)
				r.Delete("/integrations/{integrationID}", h.DeleteIntegration)
				r.Get("/webhooks", h.ListWebhooks)
				r.Post("/webhooks", h.CreateWebhook)
				r.Delete("/webhooks/{webhookID}", h.DeleteWebhook)
				r.Get("/files", h.BrowseProjectFiles)
				r.Get("/views", h.ListSavedViews)
				r.Post("/views", h.CreateSavedView)
				r.Delete("/views/{viewID}", h.DeleteSavedView)
				r.Get("/statuses", h.ListStatuses)
				r.Post("/statuses", h.CreateStatus)
				r.Put("/statuses/{statusID}", h.UpdateStatus)
				r.Delete("/statuses/{statusID}", h.DeleteStatus)
				r.Get("/channels", h.ListChannels)
				r.Post("/channels", h.CreateChannel)
				r.Get("/custom-fields", h.ListCustomFields)
				r.Post("/custom-fields", h.CreateCustomField)
				r.Delete("/custom-fields/{fieldID}", h.DeleteCustomField)
			})

			r.Delete("/automations/{ruleID}", h.DeleteAutomation)

			r.Route("/dashboards/{dashboardID}", func(r chi.Router) {
				r.Delete("/", h.DeleteDashboard)
				r.Post("/widgets", h.AddWidget)
				r.Delete("/widgets/{widgetID}", h.DeleteWidget)
			})

			r.Route("/channels/{channelID}", func(r chi.Router) {
				r.Delete("/", h.DeleteChannel)
				r.Get("/messages", h.ListMessages)
				r.Post("/messages", h.PostMessage)
				r.Post("/read", h.MarkChannelRead)
			})

			r.Patch("/sprints/{sprintID}", h.UpdateSprint)
			r.Get("/sprints/{sprintID}/burndown", h.SprintBurndown)
			r.Get("/sprints/{sprintID}/capacity", h.SprintCapacity)

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
				r.Post("/timer/start", h.StartTimer)
				r.Get("/attachments", h.ListAttachments)
				r.Post("/attachments", h.UploadAttachment)
				r.Delete("/attachments/{attachmentID}", h.DeleteAttachment)
				r.Get("/dependencies", h.ListTaskDependencies)
				r.Post("/dependencies", h.AddTaskDependency)
				r.Delete("/dependencies/{depID}", h.RemoveTaskDependency)
				r.Put("/custom-fields", h.SetTaskCustomField)
			})
		})
	})

	return r
}
