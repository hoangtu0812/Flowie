// System-admin endpoints (Module 1 / 11 system_admin).
import { request } from "./client";
import type { User, Workspace } from "@/types/models";

export const adminApi = {
  /**
   * Users are paged and searched on the server — the tenant sync can leave
   * thousands of rows, and fetching them all locked up the admin page.
   */
  adminListUsers: (opts: { q?: string; limit?: number; offset?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.q) p.set("q", opts.q);
    p.set("limit", String(opts.limit ?? 50));
    p.set("offset", String(opts.offset ?? 0));
    return request<{ users: User[]; total: number; limit: number; offset: number }>(
      `/admin/users?${p}`,
    );
  },
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
