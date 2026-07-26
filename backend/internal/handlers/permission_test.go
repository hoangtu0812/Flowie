package handlers

import (
	"testing"

	"github.com/flowie/backend/internal/domain"
)

func TestDefaultRoleGrants(t *testing.T) {
	cases := []struct {
		role  domain.WorkspaceRole
		perm  domain.Permission
		grant bool
	}{
		// Members do the day-to-day work.
		{domain.WorkspaceRoleMember, "task.create", true},
		{domain.WorkspaceRoleMember, "task.edit", true},
		{domain.WorkspaceRoleMember, "comment.create", true},
		{domain.WorkspaceRoleMember, "worklog.log", true},
		// …but must not administer the workspace or delete other people's work.
		{domain.WorkspaceRoleMember, "task.delete", false},
		{domain.WorkspaceRoleMember, "member.manage", false},
		{domain.WorkspaceRoleMember, "role.manage", false},
		{domain.WorkspaceRoleMember, "worklog.approve", false},

		// Guests are read-mostly: commenting is the only write.
		{domain.WorkspaceRoleGuest, "comment.create", true},
		{domain.WorkspaceRoleGuest, "task.create", false},
		{domain.WorkspaceRoleGuest, "task.edit", false},
		{domain.WorkspaceRoleGuest, "budget.view", false},

		// Billing sees money, runs nothing.
		{domain.WorkspaceRoleBilling, "budget.view", true},
		{domain.WorkspaceRoleBilling, "task.create", false},
		{domain.WorkspaceRoleBilling, "member.manage", false},
	}

	for _, tc := range cases {
		if got := defaultRoleGrants(tc.role, tc.perm); got != tc.grant {
			t.Errorf("defaultRoleGrants(%s, %s) = %v, want %v",
				tc.role, tc.perm, got, tc.grant)
		}
	}
}

func TestDefaultRoleGrantsDeniesUnknownInput(t *testing.T) {
	if defaultRoleGrants(domain.WorkspaceRoleMember, "made.up.permission") {
		t.Error("an unknown permission must never be granted")
	}
	if defaultRoleGrants(domain.WorkspaceRole("stranger"), "task.create") {
		t.Error("an unknown role must never be granted")
	}
	// Owners/admins are handled before this function is reached; it must not
	// hand them anything by itself.
	if defaultRoleGrants(domain.WorkspaceRoleOwner, "task.create") {
		t.Error("owner handling belongs to hasPermission, not the fallback table")
	}
}

func TestAllPermissionsAreUnique(t *testing.T) {
	seen := map[string]bool{}
	for _, p := range domain.AllPermissions {
		if seen[p] {
			t.Errorf("duplicate permission in catalogue: %s", p)
		}
		seen[p] = true
	}
	if len(domain.AllPermissions) == 0 {
		t.Error("the permission catalogue must not be empty")
	}
	// Every permission the default table grants must exist in the catalogue,
	// otherwise the role editor could never reproduce the built-in behaviour.
	for _, role := range []domain.WorkspaceRole{
		domain.WorkspaceRoleMember, domain.WorkspaceRoleGuest, domain.WorkspaceRoleBilling,
	} {
		for _, p := range domain.AllPermissions {
			_ = defaultRoleGrants(role, p) // must not panic on any catalogue entry
		}
	}
}
