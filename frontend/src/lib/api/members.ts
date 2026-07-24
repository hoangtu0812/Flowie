// Workspace/project member endpoints (Module 1.3 / 5.3 rates).
import { request } from "./client";
import type { Member } from "@/types/models";

export const membersApi = {
  listMembers: (workspaceId: string) =>
    request<{ members: Member[] }>(`/workspaces/${workspaceId}/members`).then(
      (r) => r.members,
    ),
  projectMembers: (projectId: string) =>
    request<{ members: Member[] }>(`/projects/${projectId}/members`).then(
      (r) => r.members,
    ),
  addMember: (workspaceId: string, email: string, role: string) =>
    request<Member>(`/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  updateMember: (workspaceId: string, userId: string, role: string) =>
    request<{ userId: string; role: string }>(
      `/workspaces/${workspaceId}/members/${userId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ role }),
      },
    ),
  setMemberRate: (
    workspaceId: string,
    userId: string,
    hourlyRate: number,
    currency = "USD",
  ) =>
    request<{ userId: string }>(
      `/workspaces/${workspaceId}/members/${userId}/rate`,
      {
        method: "PUT",
        body: JSON.stringify({ hourlyRate, currency }),
      },
    ),
};
