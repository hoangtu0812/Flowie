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

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  projectId: string;
  parentTaskId?: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId?: string;
  storyPoints?: number;
  startDate?: string;
  dueDate?: string;
  startAt?: string;
  endAt?: string;
  sprintId?: string;
  // enriched (list endpoint)
  labels?: Label[];
  commentCount?: number;
  checklistTotal?: number;
  checklistDone?: number;
  subtaskCount?: number;
}

export interface AutomationRule {
  id: string;
  projectId: string;
  name: string;
  triggerStatus: string;
  actionType: string;
  actionAssigneeId?: string;
  active: boolean;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  taskId?: string;
  readAt?: string;
  createdAt: string;
}

export interface Member {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  hourlyRate: number;
  currency: string;
}

export interface DashboardStats {
  workspaceCount: number;
  projectCount: number;
  openTasks: number;
  dueSoon: number;
  hoursThisWeek: number;
}

export interface ProjectStats {
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  total: number;
  done: number;
  storyPointsTotal: number;
  storyPointsDone: number;
  hoursLogged: number;
  costActual: number;
}

export interface CalendarItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  startDate?: string;
  dueDate?: string;
  startAt?: string;
  endAt?: string;
  assigneeId?: string;
  projectId: string;
  projectKey: string;
  projectName: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  state: "planned" | "active" | "completed";
  startDate?: string;
  endDate?: string;
  position: number;
}

export interface Comment {
  id: string;
  taskId: string;
  authorName: string;
  authorEmail: string;
  body: string;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  position: number;
}

export interface ActivityEvent {
  id: string;
  taskId: string;
  actorName: string;
  verb: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface Worklog {
  id: string;
  taskId: string;
  userId: string;
  minutes: number;
  note: string;
  loggedOn: string;
  source: string;
  state: string;
}

export interface TimesheetEntry extends Worklog {
  taskTitle: string;
  projectId: string;
  projectName: string;
  projectKey: string;
}

export interface TaskDetail {
  task: Task;
  comments: Comment[];
  checklist: ChecklistItem[];
  activity: ActivityEvent[];
  labels: Label[];
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
  createTask: (
    projectId: string,
    data: { title: string; priority?: string; status?: string },
  ) =>
    request<Task>(`/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateTaskStatus: (taskId: string, status: string) =>
    request<Task>(`/tasks/${taskId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),

  getTask: (taskId: string) => request<TaskDetail>(`/tasks/${taskId}`),
  updateTask: (
    taskId: string,
    data: Partial<{
      title: string;
      description: string;
      priority: string;
      storyPoints: number;
      startDate: string;
      dueDate: string;
      assigneeId: string;
      startAt: string;
      endAt: string;
    }>,
  ) =>
    request<Task>(`/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  addComment: (taskId: string, body: string) =>
    request<Comment>(`/tasks/${taskId}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),

  addChecklistItem: (taskId: string, title: string) =>
    request<ChecklistItem>(`/tasks/${taskId}/checklist`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  toggleChecklistItem: (taskId: string, itemId: string, done: boolean) =>
    request<{ id: string; done: boolean }>(`/tasks/${taskId}/checklist/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ done }),
    }),

  listLabels: (projectId: string) =>
    request<{ labels: Label[] }>(`/projects/${projectId}/labels`).then((r) => r.labels),
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

  listSprints: (projectId: string) =>
    request<{ sprints: Sprint[] }>(`/projects/${projectId}/sprints`).then((r) => r.sprints),
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

  logWork: (
    taskId: string,
    data: { minutes: number; note?: string; loggedOn?: string; source?: string },
  ) =>
    request<Worklog>(`/tasks/${taskId}/worklogs`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  listTaskWorklogs: (taskId: string) =>
    request<{ worklogs: Worklog[] }>(`/tasks/${taskId}/worklogs`).then((r) => r.worklogs),

  listMembers: (workspaceId: string) =>
    request<{ members: Member[] }>(`/workspaces/${workspaceId}/members`).then((r) => r.members),
  projectMembers: (projectId: string) =>
    request<{ members: Member[] }>(`/projects/${projectId}/members`).then((r) => r.members),
  addMember: (workspaceId: string, email: string, role: string) =>
    request<Member>(`/workspaces/${workspaceId}/members`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),
  updateMember: (workspaceId: string, userId: string, role: string) =>
    request<{ userId: string; role: string }>(`/workspaces/${workspaceId}/members/${userId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  setMemberRate: (workspaceId: string, userId: string, hourlyRate: number, currency = "USD") =>
    request<{ userId: string }>(`/workspaces/${workspaceId}/members/${userId}/rate`, {
      method: "PUT",
      body: JSON.stringify({ hourlyRate, currency }),
    }),

  notifications: () =>
    request<{ notifications: Notification[]; unread: number }>(`/me/notifications`),
  markAllNotificationsRead: () =>
    request<{ ok: boolean }>(`/me/notifications/read`, { method: "POST" }),
  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${id}/read`, { method: "PATCH" }),

  listAutomations: (projectId: string) =>
    request<{ rules: AutomationRule[] }>(`/projects/${projectId}/automations`).then((r) => r.rules),
  createAutomation: (projectId: string, data: { name: string; triggerStatus: string; assigneeId: string }) =>
    request<AutomationRule>(`/projects/${projectId}/automations`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteAutomation: (ruleId: string) =>
    request<{ ok: boolean }>(`/automations/${ruleId}`, { method: "DELETE" }),

  dashboard: () => request<DashboardStats>(`/me/dashboard`),
  projectStats: (projectId: string) => request<ProjectStats>(`/projects/${projectId}/stats`),

  myCalendar: (from: string, to: string) =>
    request<{ tasks: CalendarItem[] }>(`/me/calendar?from=${from}&to=${to}`).then((r) => r.tasks),

  myTimesheet: (from: string, to: string) =>
    request<{ from: string; to: string; entries: TimesheetEntry[] }>(
      `/me/timesheet?from=${from}&to=${to}`,
    ),
  submitTimesheet: (from: string, to: string) =>
    request<{ submitted: number }>(`/me/timesheet/submit`, {
      method: "POST",
      body: JSON.stringify({ from, to }),
    }),
  setWorklogState: (worklogId: string, state: string) =>
    request<{ id: string; state: string }>(`/worklogs/${worklogId}`, {
      method: "PATCH",
      body: JSON.stringify({ state }),
    }),
};

export { ApiError };
