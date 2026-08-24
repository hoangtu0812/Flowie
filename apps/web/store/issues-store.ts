import { createElement } from 'react';
import { Circle, CircleCheck, CircleDashed, CircleX } from 'lucide-react';
import { groupIssuesByStatus, Issue } from '@/mock-data/issues';
import { LabelInterface } from '@/mock-data/labels';
import { priorities, Priority } from '@/mock-data/priorities';
import { Project } from '@/mock-data/projects';
import { Status, StatusCategory } from '@/mock-data/status';
import { User } from '@/mock-data/users';
import { create } from 'zustand';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type ApiPerson = {
   id: string;
   name: string;
   email?: string;
   avatarUrl: string | null;
   createdAt?: string;
};
type ApiStatus = { id: string; name: string; color: string; category: string };
type ApiLabel = { id: string; name: string; color: string };
type ApiProject = {
   id: string;
   name: string;
   identifier: string;
   status: string;
   priority: string;
   health: string;
   startDate: string | null;
   targetDate: string | null;
   lead: ApiPerson | null;
   team: { id: string; identifier: string } | null;
};
type ApiIssue = {
   id: string;
   identifier: string;
   title: string;
   description: string | null;
   priority: string;
   createdAt: string;
   dueDate?: string | null;
   status: ApiStatus;
   team: { id: string; name: string; identifier: string };
   project: ApiProject | null;
   assignee: ApiPerson | null;
   creator: ApiPerson;
   labelLinks: Array<{ label: ApiLabel }>;
   cycleLinks: Array<{ cycleId: string }>;
   subscribers?: Array<{ userId: string }>;
   activities?: Array<{ id: string }>;
};
type ApiIssueOptions = {
   statuses: ApiStatus[];
   projects: ApiProject[];
   members: ApiPerson[];
   labels: ApiLabel[];
   cycles: Array<{ id: string; name: string; status: string }>;
};

export type IssueCycleOption = { id: string; name: string; status: string };

interface FilterOptions {
   status?: string[];
   assignee?: string[];
   priority?: string[];
   labels?: string[];
   project?: string[];
   cycle?: string[];
   statusType?: string[];
}

interface CreateIssueInput {
   title: string;
   description?: string;
   statusId?: string;
   priority?: string;
   assigneeId?: string;
   projectId?: string;
   labelIds?: string[];
}

interface IssuesState {
   issues: Issue[];
   issuesByStatus: Record<string, Issue[]>;
   statuses: Status[];
   projects: Project[];
   members: User[];
   labels: LabelInterface[];
   cycles: IssueCycleOption[];
   workspaceId?: string;
   teamId?: string;
   currentUserId?: string;
   isLoading: boolean;
   error?: string;
   getAllIssues: () => Issue[];
   loadIssues: (teamIdentifier?: string) => Promise<void>;
   createIssue: (input: CreateIssueInput) => Promise<void>;
   addIssue: (issue: Issue) => void;
   updateIssue: (id: string, updatedIssue: Partial<Issue>) => void;
   deleteIssue: (id: string) => void;
   filterByStatus: (statusId: string) => Issue[];
   filterByPriority: (priorityId: string) => Issue[];
   filterByAssignee: (userId: string | null) => Issue[];
   filterByLabel: (labelId: string) => Issue[];
   filterByProject: (projectId: string) => Issue[];
   filterByCycle: (cycleId: string) => Issue[];
   searchIssues: (query: string) => Issue[];
   filterIssues: (filters: FilterOptions) => Issue[];
   updateIssueStatus: (issueId: string, newStatus: Status) => void;
   updateIssuePriority: (issueId: string, newPriority: Priority) => void;
   updateIssueAssignee: (issueId: string, newAssignee: User | null) => void;
   addIssueLabel: (issueId: string, label: LabelInterface) => void;
   removeIssueLabel: (issueId: string, labelId: string) => void;
   updateIssueProject: (issueId: string, newProject: Project | undefined) => void;
   updateIssueDueDate: (issueId: string, dueDate?: string) => Promise<void>;
   setIssueSubscription: (issueId: string, subscribed: boolean) => Promise<void>;
   archiveIssue: (issueId: string) => Promise<void>;
   getIssueById: (id: string) => Issue | undefined;
}

const categoryFromApi = (category: string): StatusCategory => {
   const normalized = category.toLowerCase();
   return ['triage', 'backlog', 'unstarted', 'started', 'completed', 'canceled'].includes(
      normalized
   )
      ? (normalized as StatusCategory)
      : 'unstarted';
};

const statusIcon = (category: StatusCategory) => {
   const Icon =
      category === 'completed'
         ? CircleCheck
         : category === 'canceled'
           ? CircleX
           : category === 'backlog' || category === 'triage'
             ? CircleDashed
             : Circle;
   return () => createElement(Icon, { className: 'size-4' });
};

const mapStatus = (status: ApiStatus): Status => ({
   id: status.id,
   name: status.name,
   color: status.color,
   category: categoryFromApi(status.category),
   icon: statusIcon(categoryFromApi(status.category)),
});

const mapPriority = (priority: string): Priority =>
   priorities.find((item) => item.id === priority.toLowerCase()) ?? priorities[0];

const mapUser = (user: ApiPerson): User => ({
   id: user.id,
   name: user.name,
   avatarUrl: user.avatarUrl ?? '',
   email: user.email ?? '',
   status: 'offline',
   role: 'Member',
   joinedDate: user.createdAt ?? '',
   teamIds: [],
   timezone: 'UTC',
});

const mapLabel = (label: ApiLabel): LabelInterface => ({
   id: label.id,
   name: label.name,
   color: label.color,
});

// Project picker in the original issue dialog only renders id, icon, and name.
// These values all come from the API; the remaining Project-only fields are not displayed here.
const mapProject = (project: ApiProject): Project =>
   ({
      id: project.id,
      name: project.name,
      icon: Circle,
      status: {
         id: project.status,
         name: project.status,
         color: '#8f9299',
         category: 'unstarted',
         icon: statusIcon('unstarted'),
      },
      percentComplete: 0,
      startDate: project.startDate ?? '',
      targetDate: project.targetDate ?? undefined,
      lead: project.lead ? mapUser(project.lead) : undefined,
      priority: mapPriority(project.priority),
      health: { id: 'no-update', name: 'No Update', color: '#8f9299', description: '' },
      teamId: project.team?.id ?? '',
      labels: [],
   }) as Project;

const mapIssue = (issue: ApiIssue): Issue => ({
   id: issue.id,
   identifier: issue.identifier,
   title: issue.title,
   description: issue.description ?? '',
   status: mapStatus(issue.status),
   assignee: issue.assignee ? mapUser(issue.assignee) : null,
   creator: mapUser(issue.creator),
   priority: mapPriority(issue.priority),
   labels: issue.labelLinks.map(({ label }) => mapLabel(label)),
   createdAt: issue.createdAt,
   team: issue.team,
   isSubscribed: Boolean(issue.subscribers?.length),
   hasActivity: Boolean(issue.activities?.length),
   cycleId: issue.cycleLinks[0]?.cycleId ?? '',
   project: issue.project ? mapProject(issue.project) : undefined,
   rank: issue.createdAt,
   dueDate: issue.dueDate ?? undefined,
});

const issueState = (issues: Issue[]) => ({ issues, issuesByStatus: groupIssuesByStatus(issues) });

const patchIssue = async (issueId: string, workspaceId: string | undefined, data: unknown) => {
   if (!workspaceId) return;
   const response = await fetch(`${api}/issues/${issueId}?workspaceId=${workspaceId}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
   });
   if (!response.ok) throw new Error('Could not save the issue change.');
};

export const useIssuesStore = create<IssuesState>((set, get) => ({
   issues: [],
   issuesByStatus: {},
   statuses: [],
   projects: [],
   members: [],
   labels: [],
   cycles: [],
   isLoading: false,
   getAllIssues: () => get().issues,

   loadIssues: async (teamIdentifier) => {
      set({ isLoading: true, error: undefined });
      try {
         const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
         if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
         const workspaceData = (await workspaceResponse.json()) as {
            data: Array<{ workspace: { id: string } }>;
         };
         const workspaceId = workspaceData.data[0]?.workspace.id;
         if (!workspaceId) throw new Error('No workspace is available.');

         const teamsResponse = await fetch(`${api}/teams?workspaceId=${workspaceId}`, {
            credentials: 'include',
         });
         if (!teamsResponse.ok) throw new Error('Could not load teams.');
         const teamsData = (await teamsResponse.json()) as {
            data: Array<{ id: string; identifier: string }>;
         };
         const team = teamIdentifier
            ? teamsData.data.find(
                 (item) =>
                    item.id === teamIdentifier ||
                    item.identifier.toLowerCase() === teamIdentifier.toLowerCase()
              )
            : undefined;
         if (teamIdentifier && !team)
            throw new Error('This team is not available to the current user.');

         const query = new URLSearchParams({ workspaceId });
         if (team) query.set('teamId', team.id);
         const [issuesResponse, optionsResponse, currentUserResponse] = await Promise.all([
            fetch(`${api}/issues?${query.toString()}`, { credentials: 'include' }),
            fetch(`${api}/issues/options?${query.toString()}`, { credentials: 'include' }),
            fetch(`${api}/users/me`, { credentials: 'include' }),
         ]);
         if (!issuesResponse.ok || !optionsResponse.ok || !currentUserResponse.ok)
            throw new Error('Could not load issues.');
         const issuesData = (await issuesResponse.json()) as { data: ApiIssue[] };
         const optionsData = (await optionsResponse.json()) as { data: ApiIssueOptions };
         const currentUserData = (await currentUserResponse.json()) as { data: { id: string } };
         set({
            ...issueState(issuesData.data.map(mapIssue)),
            statuses: optionsData.data.statuses.map(mapStatus),
            projects: optionsData.data.projects.map(mapProject),
            members: optionsData.data.members.map(mapUser),
            labels: optionsData.data.labels.map(mapLabel),
            cycles: optionsData.data.cycles,
            workspaceId,
            teamId: team?.id,
            currentUserId: currentUserData.data.id,
            isLoading: false,
         });
      } catch (caught) {
         set({
            ...issueState([]),
            statuses: [],
            projects: [],
            members: [],
            labels: [],
            cycles: [],
            currentUserId: undefined,
            isLoading: false,
            error: caught instanceof Error ? caught.message : 'Could not load issues.',
         });
      }
   },

   createIssue: async (input) => {
      const { workspaceId, teamId } = get();
      if (!workspaceId || !teamId)
         throw new Error('Open a team issue view before creating an issue.');
      const response = await fetch(`${api}/issues`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({
            workspaceId,
            teamId,
            ...input,
            priority: input.priority?.toUpperCase(),
         }),
      });
      if (!response.ok) throw new Error('Could not create the issue.');
      const data = (await response.json()) as { data: ApiIssue };
      get().addIssue(mapIssue(data.data));
   },

   addIssue: (issue) => set((state) => issueState([issue, ...state.issues])),
   updateIssue: (id, updatedIssue) =>
      set((state) =>
         issueState(
            state.issues.map((issue) => (issue.id === id ? { ...issue, ...updatedIssue } : issue))
         )
      ),
   deleteIssue: (id) => set((state) => issueState(state.issues.filter((issue) => issue.id !== id))),
   filterByStatus: (statusId) => get().issues.filter((issue) => issue.status.id === statusId),
   filterByPriority: (priorityId) =>
      get().issues.filter((issue) => issue.priority.id === priorityId),
   filterByAssignee: (userId) =>
      userId === null
         ? get().issues.filter((issue) => issue.assignee === null)
         : get().issues.filter((issue) => issue.assignee?.id === userId),
   filterByLabel: (labelId) =>
      get().issues.filter((issue) => issue.labels.some((label) => label.id === labelId)),
   filterByProject: (projectId) => get().issues.filter((issue) => issue.project?.id === projectId),
   filterByCycle: (cycleId) => get().issues.filter((issue) => issue.cycleId === cycleId),
   searchIssues: (query) => {
      const term = query.toLowerCase();
      return get().issues.filter(
         (issue) =>
            issue.title.toLowerCase().includes(term) ||
            issue.identifier.toLowerCase().includes(term)
      );
   },
   filterIssues: (filters) => {
      let filtered = get().issues;
      if (filters.status?.length)
         filtered = filtered.filter((issue) => filters.status!.includes(issue.status.id));
      if (filters.assignee?.length)
         filtered = filtered.filter((issue) =>
            filters.assignee!.includes(issue.assignee?.id ?? 'unassigned')
         );
      if (filters.priority?.length)
         filtered = filtered.filter((issue) => filters.priority!.includes(issue.priority.id));
      if (filters.labels?.length)
         filtered = filtered.filter((issue) =>
            issue.labels.some((label) => filters.labels!.includes(label.id))
         );
      if (filters.project?.length)
         filtered = filtered.filter((issue) => filters.project!.includes(issue.project?.id ?? ''));
      if (filters.cycle?.length)
         filtered = filtered.filter((issue) =>
            filters.cycle!.includes(issue.cycleId || 'no-cycle')
         );
      if (filters.statusType?.length)
         filtered = filtered.filter((issue) => filters.statusType!.includes(issue.status.category));
      return filtered;
   },
   updateIssueStatus: (issueId, newStatus) => {
      get().updateIssue(issueId, { status: newStatus });
      void patchIssue(issueId, get().workspaceId, { statusId: newStatus.id });
   },
   updateIssuePriority: (issueId, newPriority) => {
      get().updateIssue(issueId, { priority: newPriority });
      void patchIssue(issueId, get().workspaceId, { priority: newPriority.id.toUpperCase() });
   },
   updateIssueAssignee: (issueId, newAssignee) => {
      get().updateIssue(issueId, { assignee: newAssignee });
      void patchIssue(issueId, get().workspaceId, { assigneeId: newAssignee?.id ?? null });
   },
   addIssueLabel: (issueId, label) => {
      const issue = get().getIssueById(issueId);
      if (issue) {
         const labels = [...issue.labels, label];
         get().updateIssue(issueId, { labels });
         void patchIssue(issueId, get().workspaceId, { labelIds: labels.map((item) => item.id) });
      }
   },
   removeIssueLabel: (issueId, labelId) => {
      const issue = get().getIssueById(issueId);
      if (issue) {
         const labels = issue.labels.filter((label) => label.id !== labelId);
         get().updateIssue(issueId, { labels });
         void patchIssue(issueId, get().workspaceId, { labelIds: labels.map((item) => item.id) });
      }
   },
   updateIssueProject: (issueId, newProject) => {
      get().updateIssue(issueId, { project: newProject });
      void patchIssue(issueId, get().workspaceId, { projectId: newProject?.id ?? null });
   },
   updateIssueDueDate: async (issueId, dueDate) => {
      await patchIssue(issueId, get().workspaceId, { dueDate: dueDate ?? null });
      get().updateIssue(issueId, { dueDate });
   },
   setIssueSubscription: async (issueId, subscribed) => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) throw new Error('No workspace is available.');
      const response = await fetch(
         `${api}/issues/${issueId}/subscribers/me?workspaceId=${workspaceId}`,
         { method: subscribed ? 'POST' : 'DELETE', credentials: 'include' }
      );
      if (!response.ok) throw new Error('Could not update subscription.');
      get().updateIssue(issueId, { isSubscribed: subscribed });
   },
   archiveIssue: async (issueId) => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) throw new Error('No workspace is available.');
      const response = await fetch(`${api}/issues/${issueId}?workspaceId=${workspaceId}`, {
         method: 'DELETE',
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not archive issue.');
      get().deleteIssue(issueId);
   },
   getIssueById: (id) => get().issues.find((issue) => issue.id === id),
}));
