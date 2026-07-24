// Personal dashboard + calendar projections (Module 4.4 / 5.1).
import { request } from "./client";
import type {
  DashboardStats,
  CalendarItem,
  WorkspaceOverview,
  ProjectOverview,
} from "@/types/models";

export const dashboardApi = {
  workspaceOverview: (workspaceId: string) =>
    request<WorkspaceOverview>(`/workspaces/${workspaceId}/overview`),
  projectOverview: (projectId: string) =>
    request<ProjectOverview>(`/projects/${projectId}/overview`),
  dashboard: (workspaceId?: string) =>
    request<DashboardStats>(
      workspaceId
        ? `/me/dashboard?workspace_id=${workspaceId}`
        : `/me/dashboard`,
    ),
  myCalendar: (from: string, to: string) =>
    request<{ tasks: CalendarItem[] }>(
      `/me/calendar?from=${from}&to=${to}`,
    ).then((r) => r.tasks),
};
