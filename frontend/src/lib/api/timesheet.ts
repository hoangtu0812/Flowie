// Timesheet + worklog-approval endpoints (Module 3.3).
import { request } from "./client";
import type { TimesheetEntry } from "@/types/models";

export const timesheetApi = {
  myTimesheet: (from: string, to: string) =>
    request<{ from: string; to: string; entries: TimesheetEntry[] }>(
      `/me/timesheet?from=${from}&to=${to}`,
    ),
  projectTimesheet: (projectId: string, from: string, to: string) =>
    request<{ from: string; to: string; entries: TimesheetEntry[] }>(
      `/projects/${projectId}/timesheet?from=${from}&to=${to}`,
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
