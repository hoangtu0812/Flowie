// Task CRUD + comments/checklist (Module 3).
import { request } from "./client";
import type { Task, TaskDetail, Comment, ChecklistItem } from "@/types/models";

export const tasksApi = {
  listTasks: (projectId: string) =>
    request<{ tasks: Task[] }>(`/projects/${projectId}/tasks`).then(
      (r) => r.tasks,
    ),
  createTask: (
    projectId: string,
    data: {
      title: string;
      priority?: string;
      status?: string;
      assigneeId?: string;
      participantIds?: string[];
    },
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
  deleteTask: (taskId: string) =>
    request<void>(`/tasks/${taskId}`, { method: "DELETE" }),
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
      reporterId: string;
      participantIds: string[];
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
    request<{ id: string; done: boolean }>(
      `/tasks/${taskId}/checklist/${itemId}`,
      {
        method: "PATCH",
        body: JSON.stringify({ done }),
      },
    ),
};
