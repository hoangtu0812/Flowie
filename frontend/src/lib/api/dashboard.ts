// Personal dashboard + calendar projections (Module 4.4 / 5.1).
import { request } from "./client";
import type {
  DashboardStats,
  CalendarItem,
  TrendRange,
  WorkspaceOverview,
  ProjectOverview,
} from "@/types/models";

export const dashboardApi = {
  /** `range` controls the trend chart's buckets: 30 daily, or 6/12 monthly. */
  workspaceOverview: (workspaceId: string, range: TrendRange = "30d") =>
    request<WorkspaceOverview>(`/workspaces/${workspaceId}/overview?range=${range}`),
  projectOverview: (projectId: string, range: TrendRange = "30d") =>
    request<ProjectOverview>(`/projects/${projectId}/overview?range=${range}`),
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
