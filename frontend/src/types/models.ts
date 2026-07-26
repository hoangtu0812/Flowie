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

export interface SavedView {
  id: string;
  projectId: string;
  ownerId?: string;
  shared: boolean;
  name: string;
  config: Record<string, unknown>;
  createdAt: string;
}

export interface APIKey {
  id: string;
  workspaceId: string;
  name: string;
  prefix: string;
  scopes: string[];
  active: boolean;
  lastUsedAt?: string;
  revokedAt?: string;
  createdAt: string;
}

export interface Integration {
  id: string;
  projectId: string;
  provider: string; // slack | teams
  webhookUrl: string;
  events: string[];
  active: boolean;
  lastStatus?: number;
  lastError?: string;
  createdAt: string;
}

export interface WorkflowStatus {
  id: string;
  projectId: string;
  key: string;
  name: string;
  category: string; // todo | in_progress | done
  color: string;
  position: number;
  wipLimit?: number;
  taskCount: number;
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
  // Backlog prioritisation (Module 3.2)
  moscow?: string; // must | should | could | wont
  riceReach?: number;
  riceImpact?: number;
  riceConfidence?: number;
  riceEffort?: number;
  riceScore?: number; // derived server-side
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
  /** Frontend path to open when clicked, e.g. "/projects/{id}?task={id}". */
  link?: string;
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

export interface UserSession {
  id: string;
  device: string;
  ip: string;
  lastSeen: string;
  expiresAt: string;
  createdAt: string;
  current: boolean;
}

export interface Webhook {
  id: string;
  projectId: string;
  url: string;
  events: string[];
  active: boolean;
  hasSecret: boolean;
  lastStatus?: number;
  lastError?: string;
  lastSentAt?: string;
  createdAt: string;
}

export interface ScheduledReport {
  id: string;
  workspaceId: string;
  projectId?: string;
  name: string;
  frequency: string;
  channelUrl: string;
  provider: string;
  hourUtc: number;
  active: boolean;
  lastRunAt?: string;
  lastStatus?: number;
  lastError?: string;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  actorId?: string;
  actorEmail: string;
  workspaceId?: string;
  action: string;
  target: string;
  ip: string;
  meta: Record<string, unknown>;
  createdAt: string;
}

/** A file or folder returned by the SharePoint browser. */
export interface DriveItem {
  id: string;
  name: string;
  webUrl: string;
  size?: number;
  folder?: { childCount: number };
  file?: { mimeType: string };
  lastModifiedDateTime?: string;
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  email: string;
  role: string;
  invitedBy?: string;
  expiresAt: string;
  acceptedAt?: string;
  expired: boolean;
  createdAt: string;
}

export interface CustomRole {
  id: string;
  workspaceId: string;
  name: string;
  permissions: string[];
  createdAt: string;
}

export interface TeamMember {
  userId: string;
  displayName: string;
  email: string;
}

export interface Team {
  id: string;
  workspaceId: string;
  name: string;
  createdAt: string;
  members: TeamMember[];
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

export interface DashboardWidget {
  id: string;
  dashboardId: string;
  type: string;
  title: string;
  config: Record<string, unknown>;
  position: number;
  width: number;
}

export interface Dashboard {
  id: string;
  workspaceId: string;
  ownerId?: string;
  shared: boolean;
  name: string;
  createdAt: string;
  widgets: DashboardWidget[];
}

/** Bucketing for the trend chart. */
export type TrendRange = "30d" | "6m" | "12m";

/** Display name + colour of a workflow column, so charts can render statuses
 *  the project defined rather than only the four built-in ones. */
export interface StatusMeta {
  key: string;
  label: string;
  color: string; // hex, or a legacy palette name
}

export interface TrendPoint {
  /** "2026-07" for monthly ranges, "2026-07-25" for the 30-day range. */
  month: string;
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
  statusMeta: StatusMeta[];
}

export interface ProjectOverview extends ProjectStats {
  overdueTasks: number;
  createdDelta: number;
  completedDelta: number;
  trend: TrendPoint[];
  statusMeta: StatusMeta[];
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

export interface BurndownPoint {
  date: string;
  remaining: number;
  remainingTasks: number;
  ideal: number;
}

export interface SprintBurndown {
  sprintId: string;
  name: string;
  startDate?: string;
  endDate?: string;
  totalPoints: number;
  totalTasks: number;
  donePoints: number;
  doneTasks: number;
  points: BurndownPoint[];
}

export interface VelocityPoint {
  sprintId: string;
  name: string;
  state: string;
  committed: number;
  completed: number;
  committedTasks: number;
  completedTasks: number;
}

export interface AssigneeCapacity {
  userId?: string;
  displayName: string;
  points: number;
  tasks: number;
  doneTasks: number;
}

export interface SprintCapacity {
  sprintId: string;
  totalPoints: number;
  totalTasks: number;
  donePoints: number;
  doneTasks: number;
  byAssignee: AssigneeCapacity[];
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

export interface ActiveTimer {
  userId: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectKey: string;
  note: string;
  startedAt: string;
  elapsedSecs: number;
}

export interface TimesheetEntry extends Worklog {
  taskTitle: string;
  projectId: string;
  projectName: string;
  projectKey: string;
  userDisplayName?: string;
  userEmail?: string;
}

export interface CriticalPathItem {
  taskId: string;
  title: string;
  status: string;
  duration: number;
  earliestStart: number;
  earliestFinish: number;
  latestStart: number;
  latestFinish: number;
  slack: number;
  critical: boolean;
}

export interface CriticalPath {
  projectDurationDays: number;
  criticalTaskIds: string[];
  items: CriticalPathItem[];
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

export interface Attachment {
  id: string;
  taskId: string;
  uploadedBy?: string;
  uploaderName: string;
  name: string;
  sizeBytes: number;
  contentType: string;
  driveItemId: string;
  webUrl: string;
  folderPath: string;
  createdAt: string;
}

export interface ChatChannel {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
  unread: number;
}

export interface ChatMessage {
  id: string;
  channelId: string;
  authorId?: string;
  authorName: string;
  authorEmail: string;
  body: string;
  createdAt: string;
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
