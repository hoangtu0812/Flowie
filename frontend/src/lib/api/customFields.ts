// Custom field endpoints (Module 3.4).
import { request } from "./client";
import type { CustomFieldDef, CustomFieldValue } from "@/types/models";

export const customFieldsApi = {
  listCustomFields: (projectId: string) =>
    request<{ fields: CustomFieldDef[] }>(
      `/projects/${projectId}/custom-fields`,
    ).then((r) => r.fields),
  createCustomField: (
    projectId: string,
    data: { name: string; fieldType: string; options?: string[] },
  ) =>
    request<CustomFieldDef>(`/projects/${projectId}/custom-fields`, {
      method: "POST",
      body: JSON.stringify(data),
    }),
  deleteCustomField: (projectId: string, fieldId: string) =>
    request<{ ok: boolean }>(
      `/projects/${projectId}/custom-fields/${fieldId}`,
      { method: "DELETE" },
    ),
  setTaskCustomField: (taskId: string, fieldId: string, value: unknown) =>
    request<{ customFields: CustomFieldValue[] }>(
      `/tasks/${taskId}/custom-fields`,
      {
        method: "PUT",
        body: JSON.stringify({ fieldId, value }),
      },
    ),
};
