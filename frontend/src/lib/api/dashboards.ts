// Custom dashboard & widget endpoints (Module 5.1).
import { request } from "./client";
import type { Dashboard, DashboardWidget } from "@/types/models";

export const dashboardsApi = {
  listDashboards: (workspaceId: string) =>
    request<{ dashboards: Dashboard[] }>(
      `/workspaces/${workspaceId}/dashboards`,
    ).then((r) => r.dashboards),
  createDashboard: (workspaceId: string, name: string, shared = false) =>
    request<Dashboard>(`/workspaces/${workspaceId}/dashboards`, {
      method: "POST",
      body: JSON.stringify({ name, shared }),
    }),
  deleteDashboard: (dashboardId: string) =>
    request<{ ok: boolean }>(`/dashboards/${dashboardId}`, { method: "DELETE" }),
  addWidget: (
    dashboardId: string,
    data: {
      type: string;
      title?: string;
      config?: Record<string, unknown>;
      width?: number;
    },
  ) =>
    request<DashboardWidget>(`/dashboards/${dashboardId}/widgets`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteWidget: (dashboardId: string, widgetId: string) =>
    request<{ ok: boolean }>(`/dashboards/${dashboardId}/widgets/${widgetId}`, {
      method: "DELETE",
    }),
};
