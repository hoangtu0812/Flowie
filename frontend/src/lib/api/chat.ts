// Project chat endpoints (Module 7.2).
import { request } from "./client";
import type { ChatChannel, ChatMessage } from "@/types/models";

export const chatApi = {
  listChannels: (projectId: string) =>
    request<{ channels: ChatChannel[] }>(`/projects/${projectId}/channels`).then(
      (r) => r.channels,
    ),
  createChannel: (projectId: string, name: string) =>
    request<ChatChannel>(`/projects/${projectId}/channels`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  deleteChannel: (channelId: string) =>
    request<{ ok: boolean }>(`/channels/${channelId}`, { method: "DELETE" }),
  listMessages: (channelId: string, limit = 100) =>
    request<{ messages: ChatMessage[] }>(
      `/channels/${channelId}/messages?limit=${limit}`,
    ).then((r) => r.messages),
  postMessage: (channelId: string, body: string) =>
    request<ChatMessage>(`/channels/${channelId}/messages`, {
      method: "POST",
      body: JSON.stringify({ body }),
    }),
  markChannelRead: (channelId: string) =>
    request<{ ok: boolean }>(`/channels/${channelId}/read`, { method: "POST" }),
};
