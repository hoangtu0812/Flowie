// Shared domain types mirroring the backend API payloads.
// These are the single source of truth for entity shapes across the UI;
// the API layer (src/lib/api) and components both import from here.

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string;
  isSystemAdmin: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  sharePointFolderPath: string;
  createdBy: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  name: string;
  key: string;
  description: string;
  status: string;
  sharePointFolderPath: string;
  // Optional per-user role enrichment (populated once role-aware listing lands).
  role?: string;
}

export interface Label {
  id: string;
  projectId: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  projectId: string;
  parentTaskId?: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assigneeId?: string;
  reporterId?: string;
  participantIds?: string[];
  storyPoints?: number;
  startDate?: string;
  dueDate?: string;
  startAt?: string;
  endAt?: string;
  sprintId?: string;
  // enriched (list endpoint)
  labels?: Label[];
  commentCount?: number;
  checklistTotal?: number;
  checklistDone?: number;
  subtaskCount?: number;
}

export interface AutomationRule {
  id: string;
  projectId: string;
  name: string;
  triggerStatus: string;
  actionType: string;
  actionAssigneeId?: string;
  active: boolean;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  taskId?: string;
  readAt?: string;
  createdAt: string;
}

export interface Member {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  role: string;
  hourlyRate: number;
  currency: string;
}

export interface DashboardStats {
  workspaceCount: number;
  projectCount: number;
  openTasks: number;
  dueSoon: number;
  hoursThisWeek: number;
}

export interface ProjectStats {
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  total: number;
  done: number;
  storyPointsTotal: number;
  storyPointsDone: number;
  hoursLogged: number;
  costActual: number;
}

export interface TrendPoint {
  month: string; // "2026-07"
  created: number;
  completed: number;
  inWork: number;
  hours: number;
}

export interface ProjectSummary {
  projectId: string;
  key: string;
  name: string;
  status: string;
  total: number;
  done: number;
  inProgress: number;
  todo: number;
  overdue: number;
  hoursLogged: number;
  costActual: number;
}

export interface AssigneeLoad {
  userId?: string;
  displayName: string;
  total: number;
  done: number;
  overdue: number;
  hoursLogged: number;
}

export interface WorkspaceOverview {
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  backlogTasks: number;
  overdueTasks: number;
  projectCount: number;
  memberCount: number;
  hoursLogged: number;
  costActual: number;
  createdDelta: number;
  completedDelta: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  projects: ProjectSummary[];
  trend: TrendPoint[];
}

export interface ProjectOverview extends ProjectStats {
  overdueTasks: number;
  createdDelta: number;
  completedDelta: number;
  trend: TrendPoint[];
  assignees: AssigneeLoad[];
}

export interface CalendarItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  startDate?: string;
  dueDate?: string;
  startAt?: string;
  endAt?: string;
  assigneeId?: string;
  assigneeName?: string;
  assigneeAvatar?: string;
  participantIds?: string[];
  projectId: string;
  projectKey: string;
  projectName: string;
}

export interface Sprint {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  state: "planned" | "active" | "completed";
  startDate?: string;
  endDate?: string;
  position: number;
}

export interface Comment {
  id: string;
  taskId: string;
  authorName: string;
  authorEmail: string;
  body: string;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  taskId: string;
  title: string;
  done: boolean;
  position: number;
}

export interface ActivityEvent {
  id: string;
  taskId: string;
  actorName: string;
  verb: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface Worklog {
  id: string;
  taskId: string;
  userId: string;
  minutes: number;
  note: string;
  loggedOn: string;
  source: string;
  state: string;
}

export interface TimesheetEntry extends Worklog {
  taskTitle: string;
  projectId: string;
  projectName: string;
  projectKey: string;
  userDisplayName?: string;
  userEmail?: string;
}

export interface TaskDependencyItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  projectKey: string;
}

export interface TaskDependencies {
  blockedBy: TaskDependencyItem[];
  blocks: TaskDependencyItem[];
}

export interface CustomFieldDef {
  id: string;
  projectId: string;
  name: string;
  fieldType: string; // text, number, dropdown, date, url
  options?: string[];
}

export interface CustomFieldValue {
  fieldId: string;
  name: string;
  fieldType: string;
  options?: string[];
  value?: unknown;
}

export interface TaskDetail {
  task: Task;
  comments: Comment[];
  checklist: ChecklistItem[];
  activity: ActivityEvent[];
  labels: Label[];
  dependencies?: TaskDependencies;
  customFields?: CustomFieldValue[];
}
