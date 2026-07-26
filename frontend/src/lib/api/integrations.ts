// Public API keys (Module 6.2) and Slack/Teams integrations (Module 6.3).
import { request } from "./client";
import type { APIKey, Integration } from "@/types/models";

export const integrationsApi = {
  // API keys — workspace scoped
  listApiKeys: (workspaceId: string) =>
    request<{ keys: APIKey[] }>(`/workspaces/${workspaceId}/api-keys`).then(
      (r) => r.keys,
    ),
  /** The plaintext secret is returned only here, once. */
  createApiKey: (workspaceId: string, name: string, scopes: string[]) =>
    request<{ key: APIKey; secret: string }>(
      `/workspaces/${workspaceId}/api-keys`,
      { method: "POST", body: JSON.stringify({ name, scopes }) },
    ),
  revokeApiKey: (workspaceId: string, keyId: string) =>
    request<{ ok: boolean }>(`/workspaces/${workspaceId}/api-keys/${keyId}`, {
      method: "DELETE",
    }),

  // Chat integrations — project scoped
  listIntegrations: (projectId: string) =>
    request<{ integrations: Integration[] }>(
      `/projects/${projectId}/integrations`,
    ).then((r) => r.integrations),
  createIntegration: (
    projectId: string,
    data: { provider: string; webhookUrl: string; events?: string[] },
  ) =>
    request<Integration>(`/projects/${projectId}/integrations`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteIntegration: (projectId: string, id: string) =>
    request<{ ok: boolean }>(`/projects/${projectId}/integrations/${id}`, {
      method: "DELETE",
    }),
};
