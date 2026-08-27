import { groupIssuesByStatus, Issue } from '@/mock-data/issues';
import { LabelInterface } from '@/mock-data/labels';
import { priorities, Priority } from '@/mock-data/priorities';
import { Project } from '@/mock-data/projects';
import { status as statusPresentation, Status, StatusCategory } from '@/mock-data/status';
import { User } from '@/mock-data/users';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { loadJoinedWorkspaceTeams, type WorkspaceTeam } from '@/components/common/teams/team-types';
import { create } from 'zustand';
import { Box } from 'lucide-react';
import { toast } from 'sonner';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

declare module '@/mock-data/issues' {
   interface Issue {
      /** Personal state persisted for the current signed-in user. */
      isSubscribed?: boolean;
      isFavorite?: boolean;
      reminderAt?: string;
      /** API-only reference used by durable issue actions; never changes Circle presentation. */
      teamId?: string;
      creatorId?: string;
      releaseIds?: string[];
   }
}

type NativeIssue = {
   id: string;
   teamId: string;
   parentIssueId?: string | null;
   identifier: string;
   title: string;
   description?: string | null;
   priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
   dueDate?: string | null;
   createdAt: string;
   updatedAt: string;
   status: { id: string; name: string; color: string; category: string };
   creator?: { id: string; name: string; avatarUrl?: string | null };
   assignee?: { id: string; name: string; avatarUrl?: string | null } | null;
   project?: { id: string; name: string } | null;
   labelLinks?: { label: LabelInterface }[];
   cycleLinks?: { cycleId: string }[];
   releaseLinks?: { releaseId: string }[];
   subscribers?: { userId: string }[];
   favorites?: { userId: string }[];
   reminderAt?: string | null;
};

type NativeIssueStatus = {
   id: string;
   name: string;
   color: string;
   category: string;
};

type NativeIssueOptions = {
   statuses: NativeIssueStatus[];
   projects: Array<{ id: string; name: string }>;
   members: Array<{ id: string; name: string; email: string; avatarUrl?: string | null }>;
   labels: LabelInterface[];
   cycles: Array<{
      id: string;
      teamId: string;
      name: string;
      status: string;
      startDate?: string | null;
      endDate?: string | null;
   }>;
   releases: Array<{
      id: string;
      name: string;
      version?: string | null;
      status?: string | null;
      targetDate?: string | null;
   }>;
};

type CreateIssuePayload = {
   teamId: string;
   title: string;
   description?: string;
   statusId?: string;
   projectId?: string;
   assigneeId?: string;
   priority?: NativeIssue['priority'];
   dueDate?: string;
   labelIds?: string[];
};

export type IssueCycle = NativeIssueOptions['cycles'][number];

const normaliseStatusName = (value: string) => value.trim().toLowerCase();

const priorityId: Record<NativeIssue['priority'], string> = {
   NONE: 'no-priority',
   LOW: 'low',
   MEDIUM: 'medium',
   HIGH: 'high',
   URGENT: 'urgent',
};

const apiPriority: Record<string, NativeIssue['priority']> = {
   'no-priority': 'NONE',
   'low': 'LOW',
   'medium': 'MEDIUM',
   'high': 'HIGH',
   'urgent': 'URGENT',
};

function asStatus(native: NativeIssueStatus): Status {
   const category = native.category.toLowerCase() as StatusCategory;
   const presentation =
      statusPresentation.find(
         (candidate) => normaliseStatusName(candidate.name) === normaliseStatusName(native.name)
      ) ??
      statusPresentation.find((candidate) => candidate.category === category) ??
      statusPresentation.find((candidate) => candidate.id === 'to-do')!;
   return {
      ...presentation,
      id: native.id,
      name: native.name,
      color: native.color,
      category,
   };
}

function asIssue(native: NativeIssue): Issue {
   const liveStatus = asStatus(native.status);
   const priority =
      priorities.find((candidate) => candidate.id === priorityId[native.priority]) ?? priorities[0];
   const assignee = native.assignee
      ? {
           id: native.assignee.id,
           name: native.assignee.name,
           avatarUrl: native.assignee.avatarUrl ?? '',
           email: '',
           status: 'offline' as const,
           role: 'Member' as const,
           joinedDate: '',
           teamIds: [],
           timezone: 'UTC',
        }
      : null;
   return {
      id: native.id,
      teamId: native.teamId,
      parentIssueId: native.parentIssueId ?? undefined,
      creatorId: native.creator?.id,
      identifier: native.identifier,
      title: native.title,
      description: native.description ?? '',
      status: liveStatus,
      assignee,
      priority,
      labels: (native.labelLinks ?? []).map(({ label }) => label),
      createdAt: native.createdAt,
      cycleId: native.cycleLinks?.[0]?.cycleId ?? '',
      releaseIds: native.releaseLinks?.map((link) => link.releaseId) ?? [],
      project: native.project
         ? ({ id: native.project.id, name: native.project.name, icon: Box } as Project)
         : undefined,
      subissues: [],
      rank: native.updatedAt,
      dueDate: native.dueDate ?? undefined,
      isSubscribed: (native.subscribers?.length ?? 0) > 0,
      isFavorite: (native.favorites?.length ?? 0) > 0,
      reminderAt: native.reminderAt ?? undefined,
   };
}

function asMember(native: NativeIssueOptions['members'][number]): User {
   return {
      id: native.id,
      name: native.name,
      avatarUrl: native.avatarUrl ?? '',
      email: native.email,
      status: 'offline',
      role: 'Member',
      joinedDate: '',
      teamIds: [],
      timezone: 'UTC',
   };
}

function asProjectOption(native: NativeIssueOptions['projects'][number]): Project {
   return { id: native.id, name: native.name, icon: Box } as Project;
}

interface FilterOptions {
   status?: string[];
   assignee?: string[];
   priority?: string[];
   labels?: string[];
   project?: string[];
   cycle?: string[];
   statusType?: string[];
}

interface IssuesState {
   // Data
   issues: Issue[];
   statuses: Status[];
   members: User[];
   teams: WorkspaceTeam[];
   projects: Project[];
   labels: LabelInterface[];
   cycles: IssueCycle[];
   releases: NativeIssueOptions['releases'];
   issuesByStatus: Record<string, Issue[]>;
   workspaceId?: string;
   loading: boolean;
   loadIssues: (teamIdentifier?: string) => Promise<void>;

   //
   getAllIssues: () => Issue[];

   // Actions
   addIssue: (issue: Issue) => void;
   updateIssue: (id: string, updatedIssue: Partial<Issue>) => void;
   deleteIssue: (id: string) => void;

   // Filters
   filterByStatus: (statusId: string) => Issue[];
   filterByPriority: (priorityId: string) => Issue[];
   filterByAssignee: (userId: string | null) => Issue[];
   filterByLabel: (labelId: string) => Issue[];
   filterByProject: (projectId: string) => Issue[];
   filterByCycle: (cycleId: string) => Issue[];
   searchIssues: (query: string) => Issue[];
   filterIssues: (filters: FilterOptions) => Issue[];

   // Status management
   updateIssueStatus: (issueId: string, newStatus: Status) => Promise<boolean>;

   // Priority management
   updateIssuePriority: (issueId: string, newPriority: Priority) => Promise<boolean>;

   // Assignee management
   updateIssueAssignee: (issueId: string, newAssignee: User | null) => Promise<boolean>;

   // Labels management
   addIssueLabel: (issueId: string, label: LabelInterface) => Promise<boolean>;
   removeIssueLabel: (issueId: string, labelId: string) => Promise<boolean>;
   replaceIssueLabels: (issueId: string, labels: LabelInterface[]) => Promise<boolean>;

   // Project management
   updateIssueProject: (issueId: string, newProject: Project | undefined) => Promise<boolean>;

   // Date management
   updateIssueDueDate: (issueId: string, dueDate: string | undefined) => Promise<boolean>;

   // Advanced issue actions
   createIssue: (payload: CreateIssuePayload) => Promise<Issue>;
   updateIssueTitle: (issueId: string, title: string) => Promise<Issue>;
   updateIssueDescription: (issueId: string, description: string) => Promise<Issue>;
   moveIssue: (issueId: string, teamId: string) => Promise<Issue>;
   classifyIssue: (
      issueId: string,
      resolution: 'DUPLICATE' | 'WONT_FIX',
      duplicateOfIdentifier?: string
   ) => Promise<Issue>;
   convertIssueToComment: (issueId: string, targetIdentifier: string) => Promise<void>;
   archiveIssue: (issueId: string) => Promise<void>;

   // Personal issue state
   updateIssueSubscription: (issueId: string, subscribed: boolean) => Promise<boolean>;
   updateIssueFavorite: (issueId: string, favorited: boolean) => Promise<boolean>;
   setIssueReminder: (issueId: string, remindAt: string | undefined) => Promise<boolean>;
   setIssueCycle: (issueId: string, cycleId: string | undefined) => Promise<boolean>;
   setIssueReleases: (issueId: string, releaseIds: string[]) => Promise<boolean>;

   // Utility functions
   getIssueById: (id: string) => Issue | undefined;
}

export const useIssuesStore = create<IssuesState>((set, get) => ({
   // Initial state
   issues: [],
   statuses: [],
   members: [],
   teams: [],
   projects: [],
   labels: [],
   cycles: [],
   releases: [],
   issuesByStatus: {},
   workspaceId: undefined,
   loading: false,
   loadIssues: async (teamIdentifier?: string) => {
      set({ loading: true });
      try {
         const workspace = await loadCurrentWorkspace();
         const query = new URLSearchParams({ workspaceId: workspace.id });
         const joinedWorkspaceTeams = await loadJoinedWorkspaceTeams();
         if (teamIdentifier) {
            const team = joinedWorkspaceTeams.teams.find(
               (candidate) =>
                  candidate.id === teamIdentifier || candidate.identifier === teamIdentifier
            );
            if (team) query.set('teamId', team.id);
         }
         const [response, optionsResponse] = await Promise.all([
            authenticatedFetch(`${api}/issues?${query}`),
            authenticatedFetch(`${api}/issues/options?${query}`),
         ]);
         if (!response.ok || !optionsResponse.ok) throw new Error('Could not load issues.');
         const [payload, optionsPayload] = (await Promise.all([
            response.json(),
            optionsResponse.json(),
         ])) as [{ data: NativeIssue[] }, { data: NativeIssueOptions }];
         const issues = payload.data.map(asIssue);
         set({
            workspaceId: workspace.id,
            issues,
            statuses: optionsPayload.data.statuses.map(asStatus),
            members: optionsPayload.data.members.map(asMember),
            teams: joinedWorkspaceTeams.teams,
            projects: optionsPayload.data.projects.map(asProjectOption),
            labels: optionsPayload.data.labels,
            cycles: optionsPayload.data.cycles ?? [],
            releases: optionsPayload.data.releases ?? [],
            issuesByStatus: groupIssuesByStatus(issues),
            loading: false,
         });
      } catch {
         set({
            issues: [],
            statuses: [],
            members: [],
            teams: [],
            projects: [],
            labels: [],
            cycles: [],
            releases: [],
            issuesByStatus: {},
            loading: false,
         });
      }
   },

   //
   getAllIssues: () => get().issues,

   // Actions
   addIssue: (issue: Issue) => {
      set((state) => {
         const newIssues = [...state.issues, issue];
         return {
            issues: newIssues,
            issuesByStatus: groupIssuesByStatus(newIssues),
         };
      });
   },

   updateIssue: (id: string, updatedIssue: Partial<Issue>) => {
      set((state) => {
         const newIssues = state.issues.map((issue) =>
            issue.id === id ? { ...issue, ...updatedIssue } : issue
         );

         return {
            issues: newIssues,
            issuesByStatus: groupIssuesByStatus(newIssues),
         };
      });
   },

   deleteIssue: (id: string) => {
      set((state) => {
         const newIssues = state.issues.filter((issue) => issue.id !== id);
         return {
            issues: newIssues,
            issuesByStatus: groupIssuesByStatus(newIssues),
         };
      });
   },

   // Filters
   filterByStatus: (statusId: string) => {
      return get().issues.filter((issue) => issue.status.id === statusId);
   },

   filterByPriority: (priorityId: string) => {
      return get().issues.filter((issue) => issue.priority.id === priorityId);
   },

   filterByAssignee: (userId: string | null) => {
      if (userId === null) {
         return get().issues.filter((issue) => issue.assignee === null);
      }
      return get().issues.filter((issue) => issue.assignee?.id === userId);
   },

   filterByLabel: (labelId: string) => {
      return get().issues.filter((issue) => issue.labels.some((label) => label.id === labelId));
   },

   filterByProject: (projectId: string) => {
      return get().issues.filter((issue) => issue.project?.id === projectId);
   },

   filterByCycle: (cycleId: string) => {
      return get().issues.filter((issue) => issue.cycleId === cycleId);
   },

   searchIssues: (query: string) => {
      const lowerCaseQuery = query.toLowerCase();
      return get().issues.filter(
         (issue) =>
            issue.title.toLowerCase().includes(lowerCaseQuery) ||
            issue.identifier.toLowerCase().includes(lowerCaseQuery)
      );
   },

   filterIssues: (filters: FilterOptions) => {
      let filteredIssues = get().issues;

      // Filter by status
      if (filters.status && filters.status.length > 0) {
         filteredIssues = filteredIssues.filter((issue) =>
            filters.status!.includes(issue.status.id)
         );
      }

      // Filter by assignee
      if (filters.assignee && filters.assignee.length > 0) {
         filteredIssues = filteredIssues.filter((issue) => {
            if (filters.assignee!.includes('unassigned')) {
               // If 'unassigned' is selected and the issue has no assignee
               if (issue.assignee === null) {
                  return true;
               }
            }
            // Check if the issue's assignee is in the selected assignees
            return issue.assignee && filters.assignee!.includes(issue.assignee.id);
         });
      }

      // Filter by priority
      if (filters.priority && filters.priority.length > 0) {
         filteredIssues = filteredIssues.filter((issue) =>
            filters.priority!.includes(issue.priority.id)
         );
      }

      // Filter by labels
      if (filters.labels && filters.labels.length > 0) {
         filteredIssues = filteredIssues.filter((issue) =>
            issue.labels.some((label) => filters.labels!.includes(label.id))
         );
      }

      // Filter by project
      if (filters.project && filters.project.length > 0) {
         filteredIssues = filteredIssues.filter(
            (issue) => issue.project && filters.project!.includes(issue.project.id)
         );
      }

      // Filter by cycle ('no-cycle' matches issues outside any cycle)
      if (filters.cycle && filters.cycle.length > 0) {
         filteredIssues = filteredIssues.filter((issue) => {
            if (filters.cycle!.includes('no-cycle') && issue.cycleId === '') {
               return true;
            }
            return filters.cycle!.includes(issue.cycleId);
         });
      }

      // Filter by status type (status category)
      if (filters.statusType && filters.statusType.length > 0) {
         filteredIssues = filteredIssues.filter((issue) =>
            filters.statusType!.includes(issue.status.category)
         );
      }

      return filteredIssues;
   },

   // Status management
   updateIssueStatus: async (issueId: string, newStatus: Status) => {
      try {
         const issue = get().getIssueById(issueId);
         const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
         const liveStatus = get().statuses.find(
            (candidate) =>
               normaliseStatusName(candidate.name) === normaliseStatusName(newStatus.name)
         );
         if (!issue || !liveStatus) {
            toast.error('This issue status is not ready yet.');
            return false;
         }
         const response = await authenticatedFetch(
            `${api}/issues/${issue.id}?${new URLSearchParams({ workspaceId })}`,
            {
               method: 'PATCH',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ statusId: liveStatus.id }),
            }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update issue status.');
         }
         const payload = (await response.json()) as { data: NativeIssue };
         const updatedIssue = asIssue(payload.data);
         set((state) => {
            const issues = state.issues.map((candidate) =>
               candidate.id === issueId ? updatedIssue : candidate
            );
            return { issues, issuesByStatus: groupIssuesByStatus(issues) };
         });
         return true;
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update issue status.');
         return false;
      }
   },

   // Priority management
   updateIssuePriority: async (issueId: string, newPriority: Priority) => {
      try {
         const issue = get().getIssueById(issueId);
         const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
         const priority = apiPriority[newPriority.id];
         if (!issue || !priority) {
            toast.error('This issue priority is not ready yet.');
            return false;
         }
         const response = await authenticatedFetch(
            `${api}/issues/${issue.id}?${new URLSearchParams({ workspaceId })}`,
            {
               method: 'PATCH',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ priority }),
            }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update issue priority.');
         }
         const payload = (await response.json()) as { data: NativeIssue };
         const updatedIssue = asIssue(payload.data);
         set((state) => {
            const issues = state.issues.map((candidate) =>
               candidate.id === issueId ? updatedIssue : candidate
            );
            return { issues, issuesByStatus: groupIssuesByStatus(issues) };
         });
         return true;
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update issue priority.');
         return false;
      }
   },

   // Assignee management
   updateIssueAssignee: async (issueId: string, newAssignee: User | null) => {
      try {
         const issue = get().getIssueById(issueId);
         const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
         if (!issue) {
            toast.error('This issue is not ready yet.');
            return false;
         }
         const response = await authenticatedFetch(
            `${api}/issues/${issue.id}?${new URLSearchParams({ workspaceId })}`,
            {
               method: 'PATCH',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ assigneeId: newAssignee?.id ?? null }),
            }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update issue assignee.');
         }
         const payload = (await response.json()) as { data: NativeIssue };
         const updatedIssue = asIssue(payload.data);
         set((state) => {
            const issues = state.issues.map((candidate) =>
               candidate.id === issueId ? updatedIssue : candidate
            );
            return { issues, issuesByStatus: groupIssuesByStatus(issues) };
         });
         return true;
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update issue assignee.');
         return false;
      }
   },

   // Labels management
   replaceIssueLabels: async (issueId: string, labels: LabelInterface[]) => {
      try {
         const issue = get().getIssueById(issueId);
         const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
         if (!issue) {
            toast.error('This issue is not ready yet.');
            return false;
         }
         const response = await authenticatedFetch(
            `${api}/issues/${issue.id}?${new URLSearchParams({ workspaceId })}`,
            {
               method: 'PATCH',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ labelIds: labels.map((label) => label.id) }),
            }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update issue labels.');
         }
         const payload = (await response.json()) as { data: NativeIssue };
         const updatedIssue = asIssue(payload.data);
         set((state) => {
            const issues = state.issues.map((candidate) =>
               candidate.id === issueId ? updatedIssue : candidate
            );
            return { issues, issuesByStatus: groupIssuesByStatus(issues) };
         });
         return true;
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update issue labels.');
         return false;
      }
   },

   addIssueLabel: async (issueId: string, label: LabelInterface) => {
      const issue = get().getIssueById(issueId);
      if (!issue || issue.labels.some((candidate) => candidate.id === label.id)) return true;
      return get().replaceIssueLabels(issueId, [...issue.labels, label]);
   },

   removeIssueLabel: async (issueId: string, labelId: string) => {
      const issue = get().getIssueById(issueId);
      if (!issue) return false;
      return get().replaceIssueLabels(
         issueId,
         issue.labels.filter((label) => label.id !== labelId)
      );
   },

   // Project management
   updateIssueProject: async (issueId: string, newProject: Project | undefined) => {
      try {
         const issue = get().getIssueById(issueId);
         const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
         if (!issue) {
            toast.error('This issue is not ready yet.');
            return false;
         }
         const response = await authenticatedFetch(
            `${api}/issues/${issue.id}?${new URLSearchParams({ workspaceId })}`,
            {
               method: 'PATCH',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ projectId: newProject?.id ?? null }),
            }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update issue project.');
         }
         const payload = (await response.json()) as { data: NativeIssue };
         const updatedIssue = asIssue(payload.data);
         set((state) => {
            const issues = state.issues.map((candidate) =>
               candidate.id === issueId ? updatedIssue : candidate
            );
            return { issues, issuesByStatus: groupIssuesByStatus(issues) };
         });
         return true;
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update issue project.');
         return false;
      }
   },

   // Date management
   updateIssueDueDate: async (issueId: string, dueDate: string | undefined) => {
      try {
         const issue = get().getIssueById(issueId);
         const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
         if (!issue) {
            toast.error('This issue is not ready yet.');
            return false;
         }
         const response = await authenticatedFetch(
            `${api}/issues/${issue.id}?${new URLSearchParams({ workspaceId })}`,
            {
               method: 'PATCH',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ dueDate: dueDate ?? null }),
            }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update issue due date.');
         }
         const payload = (await response.json()) as { data: NativeIssue };
         const updatedIssue = asIssue(payload.data);
         set((state) => {
            const issues = state.issues.map((candidate) =>
               candidate.id === issueId ? updatedIssue : candidate
            );
            return { issues, issuesByStatus: groupIssuesByStatus(issues) };
         });
         return true;
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update issue due date.');
         return false;
      }
   },

   createIssue: async (payload) => {
      const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
      const response = await authenticatedFetch(`${api}/issues`, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, ...payload }),
      });
      if (!response.ok) {
         const body = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(body?.message ?? 'Could not create issue.');
      }
      const issue = asIssue(((await response.json()) as { data: NativeIssue }).data);
      get().addIssue(issue);
      return issue;
   },

   updateIssueTitle: async (issueId, title) => {
      const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
      const response = await authenticatedFetch(
         `${api}/issues/${issueId}?${new URLSearchParams({ workspaceId })}`,
         {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title }),
         }
      );
      if (!response.ok) {
         const body = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(body?.message ?? 'Could not rename issue.');
      }
      const issue = asIssue(((await response.json()) as { data: NativeIssue }).data);
      get().updateIssue(issueId, issue);
      return issue;
   },

   updateIssueDescription: async (issueId, description) => {
      const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
      const response = await authenticatedFetch(
         `${api}/issues/${issueId}?${new URLSearchParams({ workspaceId })}`,
         {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ description }),
         }
      );
      if (!response.ok) {
         const body = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(body?.message ?? 'Could not update the description.');
      }
      const issue = asIssue(((await response.json()) as { data: NativeIssue }).data);
      get().updateIssue(issueId, issue);
      return issue;
   },

   moveIssue: async (issueId, teamId) => {
      const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
      const response = await authenticatedFetch(`${api}/issues/${issueId}/move`, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, teamId }),
      });
      if (!response.ok) {
         const body = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(body?.message ?? 'Could not move issue.');
      }
      const issue = asIssue(((await response.json()) as { data: NativeIssue }).data);
      get().updateIssue(issueId, issue);
      return issue;
   },

   classifyIssue: async (issueId, resolution, duplicateOfIdentifier) => {
      const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
      const response = await authenticatedFetch(`${api}/issues/${issueId}/classification`, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, resolution, duplicateOfIdentifier }),
      });
      if (!response.ok) {
         const body = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(body?.message ?? 'Could not classify issue.');
      }
      const issue = asIssue(((await response.json()) as { data: NativeIssue }).data);
      get().updateIssue(issueId, issue);
      return issue;
   },

   convertIssueToComment: async (issueId, targetIdentifier) => {
      const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
      const response = await authenticatedFetch(`${api}/issues/${issueId}/convert-to-comment`, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, targetIdentifier }),
      });
      if (!response.ok) {
         const body = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(body?.message ?? 'Could not convert issue into a comment.');
      }
      get().deleteIssue(issueId);
   },

   archiveIssue: async (issueId) => {
      const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
      const response = await authenticatedFetch(
         `${api}/issues/${issueId}?${new URLSearchParams({ workspaceId })}`,
         { method: 'DELETE' }
      );
      if (!response.ok) {
         const body = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(body?.message ?? 'Could not archive issue.');
      }
      get().deleteIssue(issueId);
   },

   updateIssueSubscription: async (issueId: string, subscribed: boolean) => {
      try {
         const issue = get().getIssueById(issueId);
         const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
         if (!issue) return false;
         const response = await authenticatedFetch(
            `${api}/issues/${issue.id}/subscribers/me?${new URLSearchParams({ workspaceId })}`,
            { method: subscribed ? 'POST' : 'DELETE' }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update issue subscription.');
         }
         set((state) => ({
            issues: state.issues.map((candidate) =>
               candidate.id === issueId ? { ...candidate, isSubscribed: subscribed } : candidate
            ),
         }));
         return true;
      } catch (error) {
         toast.error(
            error instanceof Error ? error.message : 'Could not update issue subscription.'
         );
         return false;
      }
   },

   updateIssueFavorite: async (issueId: string, favorited: boolean) => {
      try {
         const issue = get().getIssueById(issueId);
         const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
         if (!issue) return false;
         const response = await authenticatedFetch(
            `${api}/issues/${issue.id}/favorite?${new URLSearchParams({ workspaceId })}`,
            { method: favorited ? 'POST' : 'DELETE' }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update issue favorite.');
         }
         set((state) => ({
            issues: state.issues.map((candidate) =>
               candidate.id === issueId ? { ...candidate, isFavorite: favorited } : candidate
            ),
         }));
         return true;
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update issue favorite.');
         return false;
      }
   },

   setIssueReminder: async (issueId: string, remindAt: string | undefined) => {
      try {
         const issue = get().getIssueById(issueId);
         const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
         if (!issue) return false;
         const response = await authenticatedFetch(
            `${api}/issues/${issue.id}/reminder?${new URLSearchParams({ workspaceId })}`,
            remindAt
               ? {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ remindAt }),
                 }
               : { method: 'DELETE' }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update issue reminder.');
         }
         set((state) => ({
            issues: state.issues.map((candidate) =>
               candidate.id === issueId ? { ...candidate, reminderAt: remindAt } : candidate
            ),
         }));
         return true;
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update issue reminder.');
         return false;
      }
   },

   setIssueCycle: async (issueId, cycleId) => {
      try {
         const issue = get().getIssueById(issueId);
         const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
         if (!issue) return false;
         const currentCycleId = issue.cycleId || undefined;
         if (currentCycleId === cycleId) return true;
         if (currentCycleId) {
            const response = await authenticatedFetch(
               `${api}/cycles/${currentCycleId}/issues/${issue.id}?${new URLSearchParams({ workspaceId })}`,
               { method: 'DELETE' }
            );
            if (!response.ok) throw new Error('Could not remove issue from its current cycle.');
         }
         if (cycleId) {
            const response = await authenticatedFetch(`${api}/cycles/${cycleId}/issues`, {
               method: 'POST',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ workspaceId, issueId: issue.id }),
            });
            if (!response.ok) throw new Error('Could not add issue to this cycle.');
         }
         get().updateIssue(issue.id, { cycleId: cycleId ?? '' });
         return true;
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update issue cycle.');
         return false;
      }
   },

   setIssueReleases: async (issueId, releaseIds) => {
      try {
         const issue = get().getIssueById(issueId);
         const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
         if (!issue) return false;
         const response = await authenticatedFetch(
            `${api}/issues/${issue.id}?${new URLSearchParams({ workspaceId })}`,
            {
               method: 'PATCH',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ releaseIds }),
            }
         );
         if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { message?: string } | null;
            throw new Error(body?.message ?? 'Could not update issue releases.');
         }
         const updated = asIssue(((await response.json()) as { data: NativeIssue }).data);
         get().updateIssue(issue.id, updated);
         return true;
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update issue releases.');
         return false;
      }
   },

   // Utility functions
   getIssueById: (id: string) => {
      return get().issues.find((issue) => issue.id === id);
   },
}));
