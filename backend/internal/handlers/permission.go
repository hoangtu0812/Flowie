package handlers

import (
	"net/http"

	"github.com/flowie/backend/internal/domain"
	"github.com/flowie/backend/internal/httpx"
	"github.com/google/uuid"
)

// requirePermission decides whether a member may perform a fine-grained action.
//
// Two systems coexist on purpose:
//   - Built-in roles (owner/admin/member/guest) are the baseline every workspace
//     starts with.
//   - A custom role, when assigned, *replaces* that baseline with an explicit
//     permission list.
//
// Owners and admins always pass: locking an admin out of their own workspace by
// mis-configuring a custom role would be worse than the check itself.
func (h *Handlers) hasPermission(r *http.Request, workspaceID, userID uuid.UUID, role domain.WorkspaceRole, perm domain.Permission) bool {
	if role == domain.WorkspaceRoleOwner || role == domain.WorkspaceRoleAdmin {
		return true
	}

	perms, err := h.Store.Workspaces.PermissionsForUser(r.Context(), workspaceID, userID)
	if err != nil {
		// Fail closed on a lookup error rather than silently widening access.
		return false
	}
	if perms != nil {
		for _, p := range perms {
			if p == perm {
				return true
			}
		}
		// A custom role is authoritative: no fallback to the built-in defaults.
		return false
	}

	// No custom role — fall back to what the built-in role implies.
	return defaultRoleGrants(role, perm)
}

// defaultRoleGrants maps the built-in roles onto the permission catalogue, so
// behaviour is unchanged for workspaces that never define a custom role.
func defaultRoleGrants(role domain.WorkspaceRole, perm domain.Permission) bool {
	switch role {
	case domain.WorkspaceRoleGuest:
		// Guests may read and comment, nothing else.
		return perm == "comment.create"
	case domain.WorkspaceRoleBilling:
		// Billing sees money but does not run the project.
		return perm == "budget.view"
	case domain.WorkspaceRoleMember:
		switch perm {
		case "task.create", "task.edit", "comment.create", "worklog.log",
			"sprint.manage", "budget.view":
			return true
		}
		return false
	default:
		return false
	}
}

// requirePermission writes a 403 and returns false when the caller lacks perm.
func (h *Handlers) requirePermission(w http.ResponseWriter, r *http.Request, workspaceID, userID uuid.UUID, role domain.WorkspaceRole, perm domain.Permission) bool {
	if h.hasPermission(r, workspaceID, userID, role, perm) {
		return true
	}
	httpx.Error(w, http.StatusForbidden, "insufficient_permission",
		"bạn không có quyền "+perm)
	return false
}
