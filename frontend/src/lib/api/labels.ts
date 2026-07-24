// Label endpoints (Module 3).
import { request } from "./client";
import type { Label } from "@/types/models";

export const labelsApi = {
  listLabels: (projectId: string) =>
    request<{ labels: Label[] }>(`/projects/${projectId}/labels`).then(
      (r) => r.labels,
    ),
  createLabel: (projectId: string, name: string, color: string) =>
    request<Label>(`/projects/${projectId}/labels`, {
      method: "POST",
      body: JSON.stringify({ name, color }),
    }),
  setTaskLabel: (taskId: string, labelId: string, on: boolean) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/labels`, {
      method: "POST",
      body: JSON.stringify({ labelId, on }),
    }),
};
