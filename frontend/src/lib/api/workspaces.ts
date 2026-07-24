// Workspace endpoints (Module 2).
import { request } from "./client";
import type { Workspace } from "@/types/models";

export const workspacesApi = {
  listWorkspaces: () =>
    request<{ workspaces: Workspace[] }>("/workspaces").then((r) => r.workspaces),
  createWorkspace: (name: string) =>
    request<Workspace>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getWorkspace: (id: string) => request<Workspace>(`/workspaces/${id}`),
};
