// Project endpoints (Module 2) + project-level stats (Module 5).
import { request } from "./client";
import type { CriticalPath, Project, ProjectStats } from "@/types/models";

export const projectsApi = {
  listProjects: (workspaceId: string) =>
    request<{ projects: Project[] }>(
      `/workspaces/${workspaceId}/projects`,
    ).then((r) => r.projects),
  createProject: (
    workspaceId: string,
    data: { name: string; key: string; description?: string },
  ) =>
    request<Project>(`/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  projectStats: (projectId: string) =>
    request<ProjectStats>(`/projects/${projectId}/stats`),
  criticalPath: (projectId: string) =>
    request<CriticalPath>(`/projects/${projectId}/critical-path`),
};
