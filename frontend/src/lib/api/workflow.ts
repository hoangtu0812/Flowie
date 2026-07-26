// Per-project board column (workflow status) endpoints (Module 3.1).
import { request } from "./client";
import type { SavedView, WorkflowStatus } from "@/types/models";

export const workflowApi = {
  // Saved views (Module 4)
  listViews: (projectId: string) =>
    request<{ views: SavedView[] }>(`/projects/${projectId}/views`).then(
      (r) => r.views,
    ),
  createView: (
    projectId: string,
    name: string,
    config: Record<string, unknown>,
    shared = false,
  ) =>
    request<SavedView>(`/projects/${projectId}/views`, {
      method: "POST",
      body: JSON.stringify({ name, config, shared }),
    }),
  deleteView: (projectId: string, viewId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/views/${viewId}`, {
      method: "DELETE",
    }),

  listStatuses: (projectId: string) =>
    request<{ statuses: WorkflowStatus[] }>(
      `/projects/${projectId}/statuses`,
    ).then((r) => r.statuses),
  createStatus: (
    projectId: string,
    data: {
      name: string;
      key?: string;
      category?: string;
      color?: string;
      wipLimit?: number | null;
    },
  ) =>
    request<WorkflowStatus>(`/projects/${projectId}/statuses`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateStatus: (
    projectId: string,
    statusId: string,
    data: Partial<{
      name: string;
      category: string;
      color: string;
      position: number;
      wipLimit: number;
      clearWip: boolean;
    }>,
  ) =>
    request<{ ok: boolean }>(`/projects/${projectId}/statuses/${statusId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  deleteStatus: (projectId: string, statusId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/statuses/${statusId}`, {
      method: "DELETE",
    }),
};
