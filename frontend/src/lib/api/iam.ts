// Custom roles & teams endpoints (Module 1.2 / 1.3).
import { request } from "./client";
import type { CustomRole, Team, WorkspaceInvite } from "@/types/models";

export const iamApi = {
  // Invites (Module 1.2)
  listInvites: (workspaceId: string) =>
    request<{ invites: WorkspaceInvite[] }>(
      `/workspaces/${workspaceId}/invites`,
    ).then((r) => r.invites),
  /** Returns the one-time invite URL alongside the record. */
  createInvite: (workspaceId: string, email: string, role: string) =>
    request<{ invite: WorkspaceInvite; inviteUrl: string }>(
      `/workspaces/${workspaceId}/invites`,
      { method: "POST", body: JSON.stringify({ email, role }) },
    ),
  revokeInvite: (workspaceId: string, inviteId: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/invites/${inviteId}`, {
      method: "DELETE",
    }),
  acceptInvite: (token: string) =>
    request<{ workspaceId: string }>(`/invites/accept`, {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  listPermissions: () =>
    request<{ permissions: string[] }>(`/permissions`).then((r) => r.permissions),

  listRoles: (workspaceId: string) =>
    request<{ roles: CustomRole[] }>(`/workspaces/${workspaceId}/roles`).then(
      (r) => r.roles,
    ),
  createRole: (workspaceId: string, name: string, permissions: string[]) =>
    request<CustomRole>(`/workspaces/${workspaceId}/roles`, {
      method: "POST",
      body: JSON.stringify({ name, permissions }),
    }),
  updateRole: (
    workspaceId: string,
    roleId: string,
    name: string,
    permissions: string[],
  ) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/roles/${roleId}`, {
      method: "PUT",
      body: JSON.stringify({ name, permissions }),
    }),
  deleteRole: (workspaceId: string, roleId: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/roles/${roleId}`, {
      method: "DELETE",
    }),
  assignCustomRole: (
    workspaceId: string,
    userId: string,
    roleId: string | null,
  ) =>
    request<{ ok: boolean }>(
      `/workspaces/${workspaceId}/members/${userId}/custom-role`,
      { method: "PUT", body: JSON.stringify({ roleId }) },
    ),

  listTeams: (workspaceId: string) =>
    request<{ teams: Team[] }>(`/workspaces/${workspaceId}/teams`).then(
      (r) => r.teams,
    ),
  createTeam: (workspaceId: string, name: string) =>
    request<Team>(`/workspaces/${workspaceId}/teams`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteTeam: (workspaceId: string, teamId: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/teams/${teamId}`, {
      method: "DELETE",
    }),
  setTeamMember: (
    workspaceId: string,
    teamId: string,
    userId: string,
    on: boolean,
  ) =>
    request<{ ok: boolean }>(
      `/workspaces/${workspaceId}/teams/${teamId}/members`,
      { method: "POST", body: JSON.stringify({ userId, on }) },
    ),
};
