// Package domain holds the core entity types shared across layers.
package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// User is a person authenticated via Azure AD SSO.
type User struct {
	ID            uuid.UUID  `json:"id"`
	AzureOID      string     `json:"-"`
	Email         string     `json:"email"`
	DisplayName   string     `json:"displayName"`
	AvatarURL     string     `json:"avatarUrl"`
	IsSystemAdmin bool       `json:"isSystemAdmin"`
	IsActive      bool       `json:"isActive"`
	LastLoginAt   *time.Time `json:"lastLoginAt,omitempty"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`
}

// AuditEntry is one security-relevant action recorded for compliance review.
type AuditEntry struct {
	ID          uuid.UUID      `json:"id"`
	ActorID     *uuid.UUID     `json:"actorId,omitempty"`
	ActorEmail  string         `json:"actorEmail"`
	WorkspaceID *uuid.UUID     `json:"workspaceId,omitempty"`
	Action      string         `json:"action"`
	Target      string         `json:"target"`
	IP          string         `json:"ip"`
	Meta        map[string]any `json:"meta"`
	CreatedAt   time.Time      `json:"createdAt"`
}

// UserSession is an issued login session, shown in the device list so users can
// revoke access remotely (Module 1.1).
type UserSession struct {
	ID        uuid.UUID `json:"id"`
	Device    string    `json:"device"`
	IP        string    `json:"ip"`
	LastSeen  time.Time `json:"lastSeen"`
	ExpiresAt time.Time `json:"expiresAt"`
	CreatedAt time.Time `json:"createdAt"`
	Current   bool      `json:"current"`
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

// Permission is a fine-grained capability that a custom role may grant
// (Module 1.2). Kept as a plain string so roles stay data-driven.
type Permission = string

// AllPermissions is the catalogue offered when building a custom role.
var AllPermissions = []Permission{
	"task.create", "task.edit", "task.delete",
	"comment.create", "comment.delete",
	"worklog.log", "worklog.approve",
	"sprint.manage", "automation.manage",
	"member.manage", "role.manage", "team.manage",
	"budget.view", "project.manage",
}

// CustomRole is a workspace-defined role with an explicit permission set.
type CustomRole struct {
	ID          uuid.UUID    `json:"id"`
	WorkspaceID uuid.UUID    `json:"workspaceId"`
	Name        string       `json:"name"`
	Permissions []Permission `json:"permissions"`
	CreatedAt   time.Time    `json:"createdAt"`
}

// WorkspaceInvite pre-authorises an email address to join a workspace.
type WorkspaceInvite struct {
	ID          uuid.UUID     `json:"id"`
	WorkspaceID uuid.UUID     `json:"workspaceId"`
	Email       string        `json:"email"`
	Role        WorkspaceRole `json:"role"`
	InvitedBy   *uuid.UUID    `json:"invitedBy,omitempty"`
	ExpiresAt   time.Time     `json:"expiresAt"`
	AcceptedAt  *time.Time    `json:"acceptedAt,omitempty"`
	Expired     bool          `json:"expired"`
	CreatedAt   time.Time     `json:"createdAt"`
}

// Team groups workspace members into a department (Module 1.3).
type Team struct {
	ID          uuid.UUID    `json:"id"`
	WorkspaceID uuid.UUID    `json:"workspaceId"`
	Name        string       `json:"name"`
	CreatedAt   time.Time    `json:"createdAt"`
	Members     []TeamMember `json:"members"`
}

// TeamMember is a user belonging to a team.
type TeamMember struct {
	UserID      uuid.UUID `json:"userId"`
	DisplayName string    `json:"displayName"`
	Email       string    `json:"email"`
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
	ID        uuid.UUID `json:"id"`
	ProjectID uuid.UUID `json:"projectId"`
	// Number is the per-project counter used in references like "SAP-12".
	Number         *int        `json:"number,omitempty"`
	ParentTaskID   *uuid.UUID  `json:"parentTaskId,omitempty"`
	Title          string      `json:"title"`
	Description    string      `json:"description"`
	Status         string      `json:"status"`
	Priority       string      `json:"priority"`
	AssigneeID     *uuid.UUID  `json:"assigneeId,omitempty"`
	ReporterID     *uuid.UUID  `json:"reporterId,omitempty"`
	ParticipantIDs []uuid.UUID `json:"participantIds,omitempty"`
	StoryPoints    *float64    `json:"storyPoints,omitempty"`
	StartDate      *time.Time  `json:"startDate,omitempty"`
	DueDate        *time.Time  `json:"dueDate,omitempty"`
	Position       float64     `json:"position"`
	SprintID       *uuid.UUID  `json:"sprintId,omitempty"`
	StartAt        *time.Time  `json:"startAt,omitempty"`
	EndAt          *time.Time  `json:"endAt,omitempty"`

	// Backlog prioritisation (Module 3.2)
	Moscow         *string  `json:"moscow,omitempty"` // must | should | could | wont
	RiceReach      *float64 `json:"riceReach,omitempty"`
	RiceImpact     *float64 `json:"riceImpact,omitempty"`
	RiceConfidence *float64 `json:"riceConfidence,omitempty"`
	RiceEffort     *float64 `json:"riceEffort,omitempty"`
	RiceScore      *float64 `json:"riceScore,omitempty"` // generated column

	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
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

// BurndownPoint is one day on a sprint burndown chart (Module 5.1).
type BurndownPoint struct {
	Date           string  `json:"date"` // "2026-07-25"
	Remaining      float64 `json:"remaining"`
	RemainingTasks int     `json:"remainingTasks"`
	Ideal          float64 `json:"ideal"`
}

// SprintBurndown is the burndown series for one sprint.
type SprintBurndown struct {
	SprintID    uuid.UUID       `json:"sprintId"`
	Name        string          `json:"name"`
	StartDate   *time.Time      `json:"startDate,omitempty"`
	EndDate     *time.Time      `json:"endDate,omitempty"`
	TotalPoints float64         `json:"totalPoints"`
	TotalTasks  int             `json:"totalTasks"`
	DonePoints  float64         `json:"donePoints"`
	DoneTasks   int             `json:"doneTasks"`
	Points      []BurndownPoint `json:"points"`
}

// VelocityPoint is one completed sprint on the velocity chart.
type VelocityPoint struct {
	SprintID       uuid.UUID `json:"sprintId"`
	Name           string    `json:"name"`
	State          string    `json:"state"`
	Committed      float64   `json:"committed"`
	Completed      float64   `json:"completed"`
	CommittedTasks int       `json:"committedTasks"`
	CompletedTasks int       `json:"completedTasks"`
}

// SprintCapacity summarises a sprint's load, overall and per assignee.
type SprintCapacity struct {
	SprintID    uuid.UUID          `json:"sprintId"`
	TotalPoints float64            `json:"totalPoints"`
	TotalTasks  int                `json:"totalTasks"`
	DonePoints  float64            `json:"donePoints"`
	DoneTasks   int                `json:"doneTasks"`
	ByAssignee  []AssigneeCapacity `json:"byAssignee"`
}

// AssigneeCapacity is one person's share of a sprint.
type AssigneeCapacity struct {
	UserID      *uuid.UUID `json:"userId,omitempty"`
	DisplayName string     `json:"displayName"`
	Points      float64    `json:"points"`
	Tasks       int        `json:"tasks"`
	DoneTasks   int        `json:"doneTasks"`
}

// SavedView stores a board's filter/sort state so it can be recalled (Module 4).
type SavedView struct {
	ID        uuid.UUID      `json:"id"`
	ProjectID uuid.UUID      `json:"projectId"`
	OwnerID   *uuid.UUID     `json:"ownerId,omitempty"`
	Shared    bool           `json:"shared"`
	Name      string         `json:"name"`
	Config    map[string]any `json:"config"`
	CreatedAt time.Time      `json:"createdAt"`
}

// WorkflowStatus is a board column defined per project (Module 3.1).
type WorkflowStatus struct {
	ID        uuid.UUID `json:"id"`
	ProjectID uuid.UUID `json:"projectId"`
	Key       string    `json:"key"`
	Name      string    `json:"name"`
	Category  string    `json:"category"` // todo | in_progress | done
	Color     string    `json:"color"`
	Position  float64   `json:"position"`
	WIPLimit  *int      `json:"wipLimit,omitempty"`
	// Count of tasks currently in this column (filled by the board endpoint).
	TaskCount int `json:"taskCount"`
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

// DashboardWidget is one card on a custom dashboard (Module 5.1).
type DashboardWidget struct {
	ID          uuid.UUID      `json:"id"`
	DashboardID uuid.UUID      `json:"dashboardId"`
	Type        string         `json:"type"`
	Title       string         `json:"title"`
	Config      map[string]any `json:"config"`
	Position    float64        `json:"position"`
	Width       int            `json:"width"`
}

// Dashboard is a user-defined (or workspace-shared) set of widgets.
type Dashboard struct {
	ID          uuid.UUID         `json:"id"`
	WorkspaceID uuid.UUID         `json:"workspaceId"`
	OwnerID     *uuid.UUID        `json:"ownerId,omitempty"`
	Shared      bool              `json:"shared"`
	Name        string            `json:"name"`
	CreatedAt   time.Time         `json:"createdAt"`
	Widgets     []DashboardWidget `json:"widgets"`
}

// TrendPoint is one month of activity used by dashboard charts (Module 5.1).
type TrendPoint struct {
	Month     string  `json:"month"` // "2026-07"
	Created   int     `json:"created"`
	Completed int     `json:"completed"`
	InWork    int     `json:"inWork"`
	Hours     float64 `json:"hours"`
}

// ProjectSummary is a per-project rollup shown on the workspace dashboard.
type ProjectSummary struct {
	ProjectID   uuid.UUID `json:"projectId"`
	Key         string    `json:"key"`
	Name        string    `json:"name"`
	Status      string    `json:"status"`
	Total       int       `json:"total"`
	Done        int       `json:"done"`
	InProgress  int       `json:"inProgress"`
	Todo        int       `json:"todo"`
	Overdue     int       `json:"overdue"`
	HoursLogged float64   `json:"hoursLogged"`
	CostActual  float64   `json:"costActual"`
}

// AssigneeLoad is a per-person rollup shown on the project dashboard.
// Avatars are intentionally omitted: they are stored as base64 data URIs
// (~20KB each) and would dominate the dashboard payload.
type AssigneeLoad struct {
	UserID      *uuid.UUID `json:"userId,omitempty"`
	DisplayName string     `json:"displayName"`
	Total       int        `json:"total"`
	Done        int        `json:"done"`
	Overdue     int        `json:"overdue"`
	HoursLogged float64    `json:"hoursLogged"`
}

// WorkspaceOverview powers the workspace dashboard charts (Module 5.1).
type WorkspaceOverview struct {
	TotalTasks     int              `json:"totalTasks"`
	DoneTasks      int              `json:"doneTasks"`
	InProgressTask int              `json:"inProgressTasks"`
	BacklogTasks   int              `json:"backlogTasks"`
	OverdueTasks   int              `json:"overdueTasks"`
	ProjectCount   int              `json:"projectCount"`
	MemberCount    int              `json:"memberCount"`
	HoursLogged    float64          `json:"hoursLogged"`
	CostActual     float64          `json:"costActual"`
	CreatedDelta   float64          `json:"createdDelta"`   // % vs previous 30d
	CompletedDelta float64          `json:"completedDelta"` // % vs previous 30d
	ByStatus       map[string]int   `json:"byStatus"`
	ByPriority     map[string]int   `json:"byPriority"`
	Projects       []ProjectSummary `json:"projects"`
	Trend          []TrendPoint     `json:"trend"`
	StatusMeta     []StatusMeta     `json:"statusMeta"`
}

// StatusMeta carries a workflow column's display name and colour so charts can
// render a project-defined status correctly.
//
// Without it the frontend fell back to a hard-coded map of the four built-in
// statuses, so any column added in project settings charted as a grey slice
// labelled with its raw key.
type StatusMeta struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Color string `json:"color"` // hex ("#3b82f6"), or a legacy palette name
}

// ProjectOverview powers the per-project dashboard (Module 5.1).
type ProjectOverview struct {
	ProjectStats
	OverdueTasks   int            `json:"overdueTasks"`
	CreatedDelta   float64        `json:"createdDelta"`
	CompletedDelta float64        `json:"completedDelta"`
	Trend          []TrendPoint   `json:"trend"`
	Assignees      []AssigneeLoad `json:"assignees"`
	StatusMeta     []StatusMeta   `json:"statusMeta"`
}

// CalendarItem is a lightweight task projection for calendar/timeline views.
type CalendarItem struct {
	ID             uuid.UUID   `json:"id"`
	Title          string      `json:"title"`
	Status         string      `json:"status"`
	Priority       string      `json:"priority"`
	StartDate      *time.Time  `json:"startDate,omitempty"`
	DueDate        *time.Time  `json:"dueDate,omitempty"`
	StartAt        *time.Time  `json:"startAt,omitempty"`
	EndAt          *time.Time  `json:"endAt,omitempty"`
	AssigneeID     *uuid.UUID  `json:"assigneeId,omitempty"`
	AssigneeName   *string     `json:"assigneeName,omitempty"`
	AssigneeAvatar *string     `json:"assigneeAvatar,omitempty"`
	ParticipantIDs []uuid.UUID `json:"participantIds,omitempty"`
	ProjectID      uuid.UUID   `json:"projectId"`
	ProjectKey     string      `json:"projectKey"`
	ProjectName    string      `json:"projectName"`
}

// CustomFieldDef is a project-scoped custom field definition (Module 3.4).
type CustomFieldDef struct {
	ID        uuid.UUID       `json:"id"`
	ProjectID uuid.UUID       `json:"projectId"`
	Name      string          `json:"name"`
	FieldType string          `json:"fieldType"` // text, number, dropdown, date, url
	Options   json.RawMessage `json:"options,omitempty"`
}

// CustomFieldValue is a field definition paired with a task's value (nullable).
type CustomFieldValue struct {
	FieldID   uuid.UUID       `json:"fieldId"`
	Name      string          `json:"name"`
	FieldType string          `json:"fieldType"`
	Options   json.RawMessage `json:"options,omitempty"`
	Value     json.RawMessage `json:"value,omitempty"`
}

// CriticalPathItem is one task's CPM schedule figures (Module 4.3).
type CriticalPathItem struct {
	TaskID     uuid.UUID `json:"taskId"`
	Title      string    `json:"title"`
	Status     string    `json:"status"`
	Duration   float64   `json:"duration"` // days
	EarliestES float64   `json:"earliestStart"`
	EarliestEF float64   `json:"earliestFinish"`
	LatestLS   float64   `json:"latestStart"`
	LatestLF   float64   `json:"latestFinish"`
	Slack      float64   `json:"slack"`
	Critical   bool      `json:"critical"`
}

// CriticalPath is the CPM analysis of a project's dependency graph.
type CriticalPath struct {
	ProjectDurationDays float64            `json:"projectDurationDays"`
	CriticalTaskIDs     []uuid.UUID        `json:"criticalTaskIds"`
	Items               []CriticalPathItem `json:"items"`
}

// TaskDependencyItem is a task referenced by a dependency edge (Module 3.4).
type TaskDependencyItem struct {
	ID         uuid.UUID `json:"id"`
	Title      string    `json:"title"`
	Status     string    `json:"status"`
	Priority   string    `json:"priority"`
	ProjectKey string    `json:"projectKey"`
}

// TaskDependencies groups a task's dependency edges: tasks that block it
// (BlockedBy) and tasks it blocks (Blocks).
type TaskDependencies struct {
	BlockedBy []TaskDependencyItem `json:"blockedBy"`
	Blocks    []TaskDependencyItem `json:"blocks"`
}

// Comment is a message on a task.
type Comment struct {
	ID          uuid.UUID  `json:"id"`
	TaskID      uuid.UUID  `json:"taskId"`
	AuthorID    *uuid.UUID `json:"authorId,omitempty"`
	AuthorName  string     `json:"authorName"`
	AuthorEmail string     `json:"authorEmail"`
	Body        string     `json:"body"`
	CreatedAt   time.Time  `json:"createdAt"`
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

// ActiveTimer is a running stopwatch on a task (Module 3.3).
type ActiveTimer struct {
	UserID      uuid.UUID `json:"userId"`
	TaskID      uuid.UUID `json:"taskId"`
	TaskTitle   string    `json:"taskTitle"`
	ProjectID   uuid.UUID `json:"projectId"`
	ProjectKey  string    `json:"projectKey"`
	Note        string    `json:"note"`
	StartedAt   time.Time `json:"startedAt"`
	ElapsedSecs int64     `json:"elapsedSecs"`
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

// Automation trigger types (Module 6.1).
const (
	TriggerStatusChanged = "status_changed"
	TriggerTaskCreated   = "task_created"
)

// AutomationCondition narrows when a rule fires, e.g. {priority, eq, "high"}.
// An empty condition list means "always".
type AutomationCondition struct {
	Field string `json:"field"` // priority | status | assignee | story_points
	Op    string `json:"op"`    // eq | neq | is_empty | not_empty | gt | lt
	Value string `json:"value"`
}

// AutomationAction is one effect applied when a rule fires.
type AutomationAction struct {
	Type    string `json:"type"`             // assign | set_status | set_priority | notify
	UserID  string `json:"userId,omitempty"` // assign / notify target
	Value   string `json:"value,omitempty"`  // set_status / set_priority value
	Message string `json:"message,omitempty"`
}

// AutomationRule is a Trigger → Condition → Action rule.
//
// TriggerStatus/ActionType/ActionAssigneeID are the original v1 columns, kept
// so existing rules and the old UI keep working; the engine reads Actions.
type AutomationRule struct {
	ID          uuid.UUID `json:"id"`
	ProjectID   uuid.UUID `json:"projectId"`
	Name        string    `json:"name"`
	TriggerType string    `json:"triggerType"`

	TriggerStatus    string     `json:"triggerStatus"`
	ActionType       string     `json:"actionType"`
	ActionAssigneeID *uuid.UUID `json:"actionAssigneeId,omitempty"`

	Conditions []AutomationCondition `json:"conditions"`
	Actions    []AutomationAction    `json:"actions"`

	Active    bool      `json:"active"`
	CreatedAt time.Time `json:"createdAt"`
}

// ScheduledReport delivers a recurring summary to a chat channel (Module 5.2).
type ScheduledReport struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspaceId"`
	ProjectID   *uuid.UUID `json:"projectId,omitempty"`
	Name        string     `json:"name"`
	Frequency   string     `json:"frequency"` // daily | weekly
	ChannelURL  string     `json:"channelUrl"`
	Provider    string     `json:"provider"` // slack | teams
	HourUTC     int        `json:"hourUtc"`
	Active      bool       `json:"active"`
	LastRunAt   *time.Time `json:"lastRunAt,omitempty"`
	LastStatus  *int       `json:"lastStatus,omitempty"`
	LastError   *string    `json:"lastError,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

// Integration posts project events to Slack or MS Teams (Module 6.3).
type Integration struct {
	ID         uuid.UUID `json:"id"`
	ProjectID  uuid.UUID `json:"projectId"`
	Provider   string    `json:"provider"` // slack | teams
	WebhookURL string    `json:"webhookUrl"`
	Events     []string  `json:"events"` // empty = all
	Active     bool      `json:"active"`
	LastStatus *int      `json:"lastStatus,omitempty"`
	LastError  *string   `json:"lastError,omitempty"`
	CreatedAt  time.Time `json:"createdAt"`
}

// APIKey is a workspace-scoped credential for third-party access (Module 6.2).
// The secret itself is never returned after creation.
type APIKey struct {
	ID          uuid.UUID  `json:"id"`
	WorkspaceID uuid.UUID  `json:"workspaceId"`
	Name        string     `json:"name"`
	Prefix      string     `json:"prefix"`
	Scopes      []string   `json:"scopes"`
	Active      bool       `json:"active"`
	LastUsedAt  *time.Time `json:"lastUsedAt,omitempty"`
	RevokedAt   *time.Time `json:"revokedAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

// Webhook is an outgoing HTTP endpoint notified of project events (Module 6.2).
type Webhook struct {
	ID         uuid.UUID  `json:"id"`
	ProjectID  uuid.UUID  `json:"projectId"`
	URL        string     `json:"url"`
	Events     []string   `json:"events"` // empty = all events
	Active     bool       `json:"active"`
	LastStatus *int       `json:"lastStatus,omitempty"`
	LastError  *string    `json:"lastError,omitempty"`
	LastSentAt *time.Time `json:"lastSentAt,omitempty"`
	CreatedAt  time.Time  `json:"createdAt"`
	// Secret is write-only: never returned to clients.
	Secret string `json:"-"`
	// HasSecret tells the UI whether signing is configured.
	HasSecret bool `json:"hasSecret"`
}

// Notification is an in-app notification for a user.
type Notification struct {
	ID     uuid.UUID  `json:"id"`
	UserID uuid.UUID  `json:"userId"`
	Type   string     `json:"type"`
	Title  string     `json:"title"`
	Body   string     `json:"body"`
	TaskID *uuid.UUID `json:"taskId,omitempty"`
	// Link is the frontend path to open, e.g. "/projects/{id}?task={id}".
	Link      string     `json:"link,omitempty"`
	ReadAt    *time.Time `json:"readAt,omitempty"`
	CreatedAt time.Time  `json:"createdAt"`
}

// Attachment is a file stored in SharePoint and linked to a task (Module 3.5).
type Attachment struct {
	ID           uuid.UUID  `json:"id"`
	TaskID       uuid.UUID  `json:"taskId"`
	UploadedBy   *uuid.UUID `json:"uploadedBy,omitempty"`
	UploaderName string     `json:"uploaderName"`
	Name         string     `json:"name"`
	SizeBytes    int64      `json:"sizeBytes"`
	ContentType  string     `json:"contentType"`
	DriveItemID  string     `json:"driveItemId"`
	WebURL       string     `json:"webUrl"`
	FolderPath   string     `json:"folderPath"`
	CreatedAt    time.Time  `json:"createdAt"`
}

// ChatChannel is a per-project conversation (Module 7.2).
type ChatChannel struct {
	ID        uuid.UUID `json:"id"`
	ProjectID uuid.UUID `json:"projectId"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	Unread    int       `json:"unread"`
}

// ChatMessage is a single message in a channel.
type ChatMessage struct {
	ID          uuid.UUID  `json:"id"`
	ChannelID   uuid.UUID  `json:"channelId"`
	AuthorID    *uuid.UUID `json:"authorId,omitempty"`
	AuthorName  string     `json:"authorName"`
	AuthorEmail string     `json:"authorEmail"`
	Body        string     `json:"body"`
	CreatedAt   time.Time  `json:"createdAt"`
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
