// Package domain holds the core entity types shared across layers.
package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// User is a person authenticated via Azure AD SSO.
type User struct {
	ID          uuid.UUID  `json:"id"`
	AzureOID    string     `json:"-"`
	Email       string     `json:"email"`
	DisplayName string     `json:"displayName"`
	AvatarURL     string     `json:"avatarUrl"`
	IsSystemAdmin bool       `json:"isSystemAdmin"`
	IsActive      bool       `json:"isActive"`
	LastLoginAt *time.Time `json:"lastLoginAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

// WorkspaceRole enumerates organisation-level roles (Module 1.2).
type WorkspaceRole string

const (
	WorkspaceRoleOwner   WorkspaceRole = "owner"
	WorkspaceRoleAdmin   WorkspaceRole = "admin"
	WorkspaceRoleBilling WorkspaceRole = "billing"
	WorkspaceRoleMember  WorkspaceRole = "member"
	WorkspaceRoleGuest   WorkspaceRole = "guest"
)

// Workspace is the top-level organisation container.
type Workspace struct {
	ID                   uuid.UUID `json:"id"`
	Name                 string    `json:"name"`
	Slug                 string    `json:"slug"`
	SharePointFolderPath string    `json:"sharePointFolderPath"`
	SharePointItemID     string    `json:"-"`
	CreatedBy            uuid.UUID `json:"createdBy"`
	CreatedAt            time.Time `json:"createdAt"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

// MemberInfo is a workspace member with user profile + billing rate.
type MemberInfo struct {
	UserID      uuid.UUID     `json:"userId"`
	DisplayName string        `json:"displayName"`
	Email       string        `json:"email"`
	AvatarURL   *string       `json:"avatarUrl"`
	Role        WorkspaceRole `json:"role"`
	HourlyRate  float64       `json:"hourlyRate"`
	Currency    string        `json:"currency"`
}

// ProjectStatus enumerates project lifecycle states.
type ProjectStatus string

const (
	ProjectStatusActive   ProjectStatus = "active"
	ProjectStatusArchived ProjectStatus = "archived"
)

// ProjectRole enumerates project-level roles (Module 1.2).
type ProjectRole string

const (
	ProjectRoleManager     ProjectRole = "manager"
	ProjectRoleContributor ProjectRole = "contributor"
	ProjectRoleViewer      ProjectRole = "viewer"
)

// Project is a project inside a workspace.
type Project struct {
	ID                   uuid.UUID     `json:"id"`
	WorkspaceID          uuid.UUID     `json:"workspaceId"`
	PortfolioID          *uuid.UUID    `json:"portfolioId,omitempty"`
	Name                 string        `json:"name"`
	Key                  string        `json:"key"`
	Description          string        `json:"description"`
	Status               ProjectStatus `json:"status"`
	SharePointFolderPath string        `json:"sharePointFolderPath"`
	SharePointItemID     string        `json:"-"`
	StartDate            *time.Time    `json:"startDate,omitempty"`
	EndDate              *time.Time    `json:"endDate,omitempty"`
	CreatedBy            uuid.UUID     `json:"createdBy"`
	CreatedAt            time.Time     `json:"createdAt"`
	UpdatedAt            time.Time     `json:"updatedAt"`
}

// Task is a unit of work within a project.
type Task struct {
	ID           uuid.UUID  `json:"id"`
	ProjectID    uuid.UUID  `json:"projectId"`
	ParentTaskID *uuid.UUID `json:"parentTaskId,omitempty"`
	Title        string     `json:"title"`
	Description  string     `json:"description"`
	Status       string     `json:"status"`
	Priority     string     `json:"priority"`
	AssigneeID     *uuid.UUID  `json:"assigneeId,omitempty"`
	ReporterID     *uuid.UUID  `json:"reporterId,omitempty"`
	ParticipantIDs []uuid.UUID `json:"participantIds,omitempty"`
	StoryPoints  *float64   `json:"storyPoints,omitempty"`
	StartDate    *time.Time `json:"startDate,omitempty"`
	DueDate      *time.Time `json:"dueDate,omitempty"`
	Position     float64    `json:"position"`
	SprintID     *uuid.UUID `json:"sprintId,omitempty"`
	StartAt      *time.Time `json:"startAt,omitempty"`
	EndAt        *time.Time `json:"endAt,omitempty"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}

// SprintState enumerates sprint lifecycle states.
type SprintState string

const (
	SprintPlanned   SprintState = "planned"
	SprintActive    SprintState = "active"
	SprintCompleted SprintState = "completed"
)

// Sprint is a time-boxed iteration within a project.
type Sprint struct {
	ID        uuid.UUID   `json:"id"`
	ProjectID uuid.UUID   `json:"projectId"`
	Name      string      `json:"name"`
	Goal      string      `json:"goal"`
	State     SprintState `json:"state"`
	StartDate *time.Time  `json:"startDate,omitempty"`
	EndDate   *time.Time  `json:"endDate,omitempty"`
	Position  float64     `json:"position"`
	CreatedAt time.Time   `json:"createdAt"`
	UpdatedAt time.Time   `json:"updatedAt"`
}

// Label is a project-scoped tag.
type Label struct {
	ID        uuid.UUID `json:"id"`
	ProjectID uuid.UUID `json:"projectId"`
	Name      string    `json:"name"`
	Color     string    `json:"color"`
}

// TaskListItem is a Task enriched with aggregates for board/list rendering.
type TaskListItem struct {
	Task
	Labels         []Label `json:"labels"`
	CommentCount   int     `json:"commentCount"`
	ChecklistTotal int     `json:"checklistTotal"`
	ChecklistDone  int     `json:"checklistDone"`
	SubtaskCount   int     `json:"subtaskCount"`
}

// ProjectStats aggregates a project's metrics for analytics dashboards.
type ProjectStats struct {
	ByStatus         map[string]int `json:"byStatus"`
	ByPriority       map[string]int `json:"byPriority"`
	Total            int            `json:"total"`
	Done             int            `json:"done"`
	StoryPointsTotal float64        `json:"storyPointsTotal"`
	StoryPointsDone  float64        `json:"storyPointsDone"`
	HoursLogged      float64        `json:"hoursLogged"`
	CostActual       float64        `json:"costActual"`
}

// DashboardStats aggregates a user's cross-workspace metrics.
type DashboardStats struct {
	WorkspaceCount int     `json:"workspaceCount"`
	ProjectCount   int     `json:"projectCount"`
	OpenTasks      int     `json:"openTasks"`
	DueSoon        int     `json:"dueSoon"`
	HoursThisWeek  float64 `json:"hoursThisWeek"`
}

// CalendarItem is a lightweight task projection for calendar/timeline views.
type CalendarItem struct {
	ID          uuid.UUID  `json:"id"`
	Title       string     `json:"title"`
	Status      string     `json:"status"`
	Priority    string     `json:"priority"`
	StartDate   *time.Time `json:"startDate,omitempty"`
	DueDate     *time.Time `json:"dueDate,omitempty"`
	StartAt     *time.Time `json:"startAt,omitempty"`
	EndAt       *time.Time `json:"endAt,omitempty"`
	AssigneeID     *uuid.UUID `json:"assigneeId,omitempty"`
	AssigneeName   *string       `json:"assigneeName,omitempty"`
	AssigneeAvatar *string       `json:"assigneeAvatar,omitempty"`
	ParticipantIDs []uuid.UUID   `json:"participantIds,omitempty"`
	ProjectID      uuid.UUID     `json:"projectId"`
	ProjectKey  string     `json:"projectKey"`
	ProjectName string     `json:"projectName"`
}

// Comment is a message on a task.
type Comment struct {
	ID          uuid.UUID `json:"id"`
	TaskID      uuid.UUID `json:"taskId"`
	AuthorID    *uuid.UUID `json:"authorId,omitempty"`
	AuthorName  string    `json:"authorName"`
	AuthorEmail string    `json:"authorEmail"`
	Body        string    `json:"body"`
	CreatedAt   time.Time `json:"createdAt"`
}

// ChecklistItem is a sub-item of a task's checklist.
type ChecklistItem struct {
	ID        uuid.UUID `json:"id"`
	TaskID    uuid.UUID `json:"taskId"`
	Title     string    `json:"title"`
	Done      bool      `json:"done"`
	Position  float64   `json:"position"`
	CreatedAt time.Time `json:"createdAt"`
}

// Worklog is a time entry logged against a task.
type Worklog struct {
	ID        uuid.UUID `json:"id"`
	TaskID    uuid.UUID `json:"taskId"`
	UserID    uuid.UUID `json:"userId"`
	Minutes   int       `json:"minutes"`
	Note      string    `json:"note"`
	LoggedOn  time.Time `json:"loggedOn"`
	Source    string    `json:"source"`
	State     string    `json:"state"`
	CreatedAt time.Time `json:"createdAt"`
}

// TimesheetEntry is a worklog enriched with task/project context for grids.
type TimesheetEntry struct {
	Worklog
	TaskTitle       string    `json:"taskTitle"`
	ProjectID       uuid.UUID `json:"projectId"`
	ProjectName     string    `json:"projectName"`
	ProjectKey      string    `json:"projectKey"`
	UserDisplayName string    `json:"userDisplayName,omitempty"`
	UserEmail       string    `json:"userEmail,omitempty"`
}

// AutomationRule is a simple Trigger→Action rule (MVP): when a task's status
// changes to TriggerStatus, perform ActionType (currently "assign").
type AutomationRule struct {
	ID               uuid.UUID  `json:"id"`
	ProjectID        uuid.UUID  `json:"projectId"`
	Name             string     `json:"name"`
	TriggerStatus    string     `json:"triggerStatus"`
	ActionType       string     `json:"actionType"`
	ActionAssigneeID *uuid.UUID `json:"actionAssigneeId,omitempty"`
	Active           bool       `json:"active"`
	CreatedAt        time.Time  `json:"createdAt"`
}

// Notification is an in-app notification for a user.
type Notification struct {
	ID        uuid.UUID  `json:"id"`
	UserID    uuid.UUID  `json:"userId"`
	Type      string     `json:"type"`
	Title     string     `json:"title"`
	Body      string     `json:"body"`
	TaskID    *uuid.UUID `json:"taskId,omitempty"`
	ReadAt    *time.Time `json:"readAt,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
}

// ActivityEvent is an audit entry on a task.
type ActivityEvent struct {
	ID        uuid.UUID       `json:"id"`
	TaskID    uuid.UUID       `json:"taskId"`
	ActorID   *uuid.UUID      `json:"actorId,omitempty"`
	ActorName string          `json:"actorName"`
	Verb      string          `json:"verb"`
	Meta      json.RawMessage `json:"meta"`
	CreatedAt time.Time       `json:"createdAt"`
}
