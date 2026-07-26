// Operational endpoints: outgoing webhooks, scheduled reports, audit log and
// the SharePoint file browser. These existed on the backend before they had a
// client, so they are grouped here rather than scattered.
import { request } from "./client";
import type {
  AuditEntry,
  DriveItem,
  ScheduledReport,
  Webhook,
} from "@/types/models";

export const opsApi = {
  // Outgoing webhooks (Module 6.2) — project scoped
  listWebhooks: (projectId: string) =>
    request<{ webhooks: Webhook[] }>(`/projects/${projectId}/webhooks`).then(
      (r) => r.webhooks,
    ),
  createWebhook: (
    projectId: string,
    data: { url: string; events?: string[]; secret?: string },
  ) =>
    request<Webhook>(`/projects/${projectId}/webhooks`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteWebhook: (projectId: string, webhookId: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/webhooks/${webhookId}`, {
      method: "DELETE",
    }),

  // Scheduled digests (Module 5.2) — workspace scoped
  listReports: (workspaceId: string) =>
    request<{ reports: ScheduledReport[] }>(
      `/workspaces/${workspaceId}/reports`,
    ).then((r) => r.reports),
  createReport: (
    workspaceId: string,
    data: {
      name: string;
      frequency: string;
      channelUrl: string;
      provider: string;
      hourUtc: number;
      projectId?: string | null;
    },
  ) =>
    request<ScheduledReport>(`/workspaces/${workspaceId}/reports`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteReport: (workspaceId: string, reportId: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/reports/${reportId}`, {
      method: "DELETE",
    }),
  /** Sends the digest immediately, to verify the channel works. */
  runReportNow: (workspaceId: string, reportId: string) =>
    request<{ sent: boolean }>(
      `/workspaces/${workspaceId}/reports/${reportId}/run`,
      { method: "POST" },
    ),

  // Audit trail (SOC2 groundwork)
  listAuditLog: (workspaceId: string, limit = 200) =>
    request<{ entries: AuditEntry[] }>(
      `/workspaces/${workspaceId}/audit-log?limit=${limit}`,
    ).then((r) => r.entries),
  adminAuditLog: (limit = 200) =>
    request<{ entries: AuditEntry[] }>(`/admin/audit-log?limit=${limit}`).then(
      (r) => r.entries,
    ),

  // SharePoint file browser (Module 3.5)
  browseFiles: (projectId: string, path = "") =>
    request<{ root: string; path: string; items: DriveItem[] }>(
      `/projects/${projectId}/files?path=${encodeURIComponent(path)}`,
    ),

  // Session rotation (Module 1.1)
  refreshSession: (force = false) =>
    request<{ rotated: boolean; expiresAt: string }>(
      `/me/session/refresh${force ? "?force=1" : ""}`,
      { method: "POST" },
    ),

  // Automation rules with conditions (Module 6.1)
  createAutomationV2: (
    projectId: string,
    data: {
      name: string;
      triggerType?: string;
      triggerStatus?: string;
      conditions?: { field: string; op: string; value: string }[];
      actions: { type: string; userId?: string; value?: string; message?: string }[];
    },
  ) =>
    request<unknown>(`/projects/${projectId}/automations/v2`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
};
