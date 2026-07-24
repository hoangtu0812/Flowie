// Worklog endpoints (Module 3.3).
import { request } from "./client";
import type { Worklog } from "@/types/models";

export const worklogsApi = {
  logWork: (
    taskId: string,
    data: { minutes: number; note?: string; loggedOn?: string; source?: string },
  ) =>
    request<Worklog>(`/tasks/${taskId}/worklogs`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listTaskWorklogs: (taskId: string) =>
    request<{ worklogs: Worklog[] }>(`/tasks/${taskId}/worklogs`).then(
      (r) => r.worklogs,
    ),
};
