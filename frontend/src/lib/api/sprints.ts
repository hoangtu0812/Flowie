// Sprint / backlog endpoints (Module 3.2).
import { request } from "./client";
import type { Sprint } from "@/types/models";

export const sprintsApi = {
  listSprints: (projectId: string) =>
    request<{ sprints: Sprint[] }>(`/projects/${projectId}/sprints`).then(
      (r) => r.sprints,
    ),
  createSprint: (projectId: string, name: string, goal = "") =>
    request<Sprint>(`/projects/${projectId}/sprints`, {
      method: "POST",
      body: JSON.stringify({ name, goal }),
    }),
  updateSprint: (
    sprintId: string,
    data: Partial<{ name: string; goal: string; state: string }>,
  ) =>
    request<Sprint>(`/sprints/${sprintId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),
  setTaskSprint: (taskId: string, sprintId: string | null) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/sprint`, {
      method: "PATCH",
      body: JSON.stringify({ sprintId }),
    }),
};
