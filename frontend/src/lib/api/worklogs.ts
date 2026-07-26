// Worklog endpoints (Module 3.3).
import { request } from "./client";
import type { ActiveTimer, Worklog } from "@/types/models";

export const worklogsApi = {
  // Stopwatch (Module 3.3)
  startTimer: (taskId: string, note = "") =>
    request<ActiveTimer>(`/tasks/${taskId}/timer/start`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  activeTimer: () =>
    request<{ timer: ActiveTimer | null }>(`/me/timer`).then((r) => r.timer),
  stopTimer: (note = "") =>
    request<Worklog>(`/me/timer/stop`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  cancelTimer: () => request<{ ok: boolean }>(`/me/timer`, { method: "DELETE" }),

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
