// Automation-rule endpoints (Module 6.1).
import { request } from "./client";
import type { AutomationRule } from "@/types/models";

export const automationsApi = {
  listAutomations: (projectId: string) =>
    request<{ rules: AutomationRule[] }>(
      `/projects/${projectId}/automations`,
    ).then((r) => r.rules),
  createAutomation: (
    projectId: string,
    data: { name: string; triggerStatus: string; assigneeId: string },
  ) =>
    request<AutomationRule>(`/projects/${projectId}/automations`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteAutomation: (ruleId: string) =>
    request<{ ok: boolean }>(`/automations/${ruleId}`, { method: "DELETE" }),
};
