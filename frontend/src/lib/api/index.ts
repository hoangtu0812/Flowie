// Public entry point for the Flowie API layer.
//
// The API is split into per-domain modules (auth, projects, tasks, …) under
// `src/lib/api/`. This barrel composes them into a single `api` object and
// re-exports the shared types, so callers keep importing from "@/lib/api":
//
//   import { api, Task } from "@/lib/api";

import { authApi } from "./auth";
import { adminApi } from "./admin";
import { workspacesApi } from "./workspaces";
import { projectsApi } from "./projects";
import { tasksApi } from "./tasks";
import { dependenciesApi } from "./dependencies";
import { customFieldsApi } from "./customFields";
import { labelsApi } from "./labels";
import { workflowApi } from "./workflow";
import { sprintsApi } from "./sprints";
import { worklogsApi } from "./worklogs";
import { membersApi } from "./members";
import { iamApi } from "./iam";
import { chatApi } from "./chat";
import { integrationsApi } from "./integrations";
import { opsApi } from "./ops";
import { notificationsApi } from "./notifications";
import { automationsApi } from "./automations";
import { dashboardApi } from "./dashboard";
import { dashboardsApi } from "./dashboards";
import { timesheetApi } from "./timesheet";

export const api = {
  ...authApi,
  ...adminApi,
  ...workspacesApi,
  ...projectsApi,
  ...tasksApi,
  ...dependenciesApi,
  ...customFieldsApi,
  ...labelsApi,
  ...workflowApi,
  ...sprintsApi,
  ...worklogsApi,
  ...membersApi,
  ...iamApi,
  ...chatApi,
  ...integrationsApi,
  ...opsApi,
  ...notificationsApi,
  ...automationsApi,
  ...dashboardApi,
  ...dashboardsApi,
  ...timesheetApi,
};

export { API_BASE, ApiError } from "./client";
export * from "@/types/models";
