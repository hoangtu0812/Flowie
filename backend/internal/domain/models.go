// Package domain holds the core entity types shared across layers.
package domain

import (
	"time"

	"github.com/google/uuid"
)

// User is a person authenticated via Azure AD SSO.
type User struct {
	ID          uuid.UUID  `json:"id"`
	AzureOID    string     `json:"-"`
	Email       string     `json:"email"`
	DisplayName string     `json:"displayName"`
	AvatarURL   string     `json:"avatarUrl"`
	IsActive    bool       `json:"isActive"`
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
	AssigneeID   *uuid.UUID `json:"assigneeId,omitempty"`
	ReporterID   *uuid.UUID `json:"reporterId,omitempty"`
	StoryPoints  *float64   `json:"storyPoints,omitempty"`
	StartDate    *time.Time `json:"startDate,omitempty"`
	DueDate      *time.Time `json:"dueDate,omitempty"`
	Position     float64    `json:"position"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}
