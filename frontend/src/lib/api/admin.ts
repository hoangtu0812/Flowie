// System-admin endpoints (Module 1 / 11 system_admin).
import { request } from "./client";
import type { User, Workspace } from "@/types/models";

export const adminApi = {
  adminListUsers: () => request<User[]>("/admin/users"),
  adminSyncAzureUsers: () =>
    request<{ synced: number }>("/admin/users/sync-azure", { method: "POST" }),
  adminToggleUser: (userId: string, isSystemAdmin: boolean) =>
    request<void>(`/admin/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ isSystemAdmin }),
    }),
  adminListWorkspaces: () => request<Workspace[]>("/admin/workspaces"),
  adminCreateWorkspace: (name: string, owner_id: string) =>
    request<Workspace>("/admin/workspaces", {
      method: "POST",
      body: JSON.stringify({ name, owner_id }),
    }),
  adminDeleteWorkspace: (id: string) =>
    request<{ status: string }>(`/admin/workspaces/${id}`, { method: "DELETE" }),
};
