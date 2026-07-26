// Task CRUD + comments/checklist (Module 3).
import { API_BASE, request } from "./client";
import type {
  Task,
  TaskDetail,
  Comment,
  ChecklistItem,
  Attachment,
} from "@/types/models";

export const tasksApi = {
  // Attachments (Module 3.5) — files live in SharePoint
  listAttachments: (taskId: string) =>
    request<{ attachments: Attachment[] }>(`/tasks/${taskId}/attachments`).then(
      (r) => r.attachments,
    ),
  /** Uploads via multipart; fetch sets the boundary so no Content-Type here. */
  uploadAttachment: async (taskId: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/api/v1/tasks/${taskId}/attachments`, {
      method: "POST",
      credentials: "include",
      body: form,
    });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        const b = await res.json();
        msg = b.message || b.error || msg;
      } catch {
        /* ignore */
      }
      throw new Error(msg);
    }
    return (await res.json()) as Attachment;
  },
  deleteAttachment: (taskId: string, attachmentId: string) =>
    request<{ ok: boolean }>(`/tasks/${taskId}/attachments/${attachmentId}`, {
      method: "DELETE",
    }),

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
      moscow: string;
      riceReach: number;
      riceImpact: number;
      riceConfidence: number;
      riceEffort: number;
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
