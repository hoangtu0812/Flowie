// Notification endpoints (Module 7.1).
import { request } from "./client";
import type { Notification } from "@/types/models";

export const notificationsApi = {
  notifications: () =>
    request<{ notifications: Notification[]; unread: number }>(
      `/me/notifications`,
    ),
  markAllNotificationsRead: () =>
    request<{ ok: boolean }>(`/me/notifications/read`, { method: "POST" }),
  markNotificationRead: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${id}/read`, { method: "PATCH" }),
};
