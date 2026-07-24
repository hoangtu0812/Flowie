// Task dependency endpoints (Module 3.4).
import { request } from "./client";
import type { TaskDependencies } from "@/types/models";

export const dependenciesApi = {
  listDependencies: (taskId: string) =>
    request<TaskDependencies>(`/tasks/${taskId}/dependencies`),
  addDependency: (taskId: string, dependsOnId: string) =>
    request<TaskDependencies>(`/tasks/${taskId}/dependencies`, {
      method: "POST",
      body: JSON.stringify({ dependsOnId }),
    }),
  removeDependency: (taskId: string, dependsOnId: string) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/dependencies/${dependsOnId}`, {
      method: "DELETE",
    }),
};
