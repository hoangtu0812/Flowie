// Thin client for the Flowie backend API. All requests send the session cookie
// (credentials: "include") so the httpOnly Azure AD session is used.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8080";

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  sharePointFolderPath: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  description: string;
  status: string;
  sharePointFolderPath: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId?: string;
}

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.json();
      msg = body.message || body.error || msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  loginUrl: () => `${API_BASE}/api/v1/auth/azure/login`,
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  me: () => request<User>("/me"),

  listWorkspaces: () =>
    request<{ workspaces: Workspace[] }>("/workspaces").then((r) => r.workspaces),
  createWorkspace: (name: string) =>
    request<Workspace>("/workspaces", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  getWorkspace: (id: string) => request<Workspace>(`/workspaces/${id}`),

  listProjects: (workspaceId: string) =>
    request<{ projects: Project[] }>(
      `/workspaces/${workspaceId}/projects`,
    ).then((r) => r.projects),
  createProject: (workspaceId: string, data: { name: string; key: string; description?: string }) =>
    request<Project>(`/workspaces/${workspaceId}/projects`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getProject: (id: string) => request<Project>(`/projects/${id}`),

  listTasks: (projectId: string) =>
    request<{ tasks: Task[] }>(`/projects/${projectId}/tasks`).then(
      (r) => r.tasks,
    ),
  createTask: (projectId: string, data: { title: string; priority?: string }) =>
    request<Task>(`/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTaskStatus: (taskId: string, status: string) =>
    request<Task>(`/tasks/${taskId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
};

export { ApiError };
