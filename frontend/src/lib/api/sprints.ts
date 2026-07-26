// Sprint / backlog endpoints (Module 3.2).
import { request } from "./client";
import type {
  Sprint,
  SprintBurndown,
  SprintCapacity,
  VelocityPoint,
} from "@/types/models";

export const sprintsApi = {
  // Agile reports (Module 5.1)
  sprintBurndown: (sprintId: string) =>
    request<SprintBurndown>(`/sprints/${sprintId}/burndown`),
  sprintCapacity: (sprintId: string) =>
    request<SprintCapacity>(`/sprints/${sprintId}/capacity`),
  projectVelocity: (projectId: string) =>
    request<{ sprints: VelocityPoint[] }>(`/projects/${projectId}/velocity`).then(
      (r) => r.sprints,
    ),

  listSprints: (projectId: string) =>
    request<{ sprints: Sprint[] }>(`/projects/${projectId}/sprints`).then(
      (r) => r.sprints,
    ),
  createSprint: (
    projectId: string,
    name: string,
    goal = "",
    dates: { startDate?: string; endDate?: string } = {},
  ) =>
    request<Sprint>(`/projects/${projectId}/sprints`, {
      method: "POST",
      body: JSON.stringify({ name, goal, ...dates }),
    }),
  updateSprint: (
    sprintId: string,
    data: Partial<{
      name: string;
      goal: string;
      state: string;
      startDate: string;
      endDate: string;
    }>,
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
