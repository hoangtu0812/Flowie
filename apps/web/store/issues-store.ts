import { createElement } from 'react';
import { Circle, CircleCheck, CircleDashed, CircleX } from 'lucide-react';
import { groupIssuesByStatus, Issue } from '@/types/issues';
import { LabelInterface } from '@/types/labels';
import { priorities, Priority } from '@/lib/priority-presentations';
import { Project } from '@/types/projects';
import { status as statusPresentations, Status, StatusCategory } from '@/lib/status-presentations';
import { User } from '@/types/users';
import { create } from 'zustand';
import { loadCurrentWorkspace } from '@/lib/workspaces';

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
   releaseLinks: Array<{ releaseId: string }>;
   subscribers?: Array<{ userId: string }>;
   activities?: Array<{ id: string }>;
   favorites?: Array<{ userId: string }>;
   reminders?: Array<{ id: string; remindAt: string; deliveredAt: string | null }>;
   resolution?: 'DUPLICATE' | 'WONT_FIX' | null;
   duplicateOfId?: string | null;
};
type ApiIssueOptions = {
   statuses: ApiStatus[];
   projects: ApiProject[];
   members: ApiPerson[];
   labels: ApiLabel[];
   cycles: Array<{
      id: string;
      name: string;
      status: string;
      startDate: string | null;
      endDate: string | null;
   }>;
   templates: IssueTemplateOption[];
   releases: IssueReleaseOption[];
};

export type IssueCycleOption = {
   id: string;
   name: string;
   status: string;
   startDate: string | null;
   endDate: string | null;
};

export type IssueReleaseOption = {
   id: string;
   name: string;
   version: string;
   status: string;
   targetDate: string | null;
};

export type IssueTeamOption = { id: string; name: string; identifier: string; joined: boolean };

export type IssueTemplateOption = {
   id: string;
   name: string;
   description: string | null;
   title: string;
   issueDescription: string | null;
   statusId: string | null;
   priority: string;
   projectId: string | null;
   assigneeId: string | null;
   labelIds: string[];
};

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
   teamId?: string;
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
   releases: IssueReleaseOption[];
   templates: IssueTemplateOption[];
   teams: IssueTeamOption[];
   workspaceId?: string;
   teamId?: string;
   currentUserId?: string;
   isLoading: boolean;
   error?: string;
   getAllIssues: () => Issue[];
   loadIssues: (teamIdentifier?: string) => Promise<void>;
   createIssue: (input: CreateIssueInput) => Promise<Issue>;
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
   updateIssueStatus: (issueId: string, newStatus: Status) => Promise<void>;
   updateIssuePriority: (issueId: string, newPriority: Priority) => Promise<void>;
   updateIssueAssignee: (issueId: string, newAssignee: User | null) => Promise<void>;
   addIssueLabel: (issueId: string, label: LabelInterface) => Promise<void>;
   removeIssueLabel: (issueId: string, labelId: string) => Promise<void>;
   updateIssueProject: (issueId: string, newProject: Project | undefined) => Promise<void>;
   updateIssueDueDate: (issueId: string, dueDate?: string) => Promise<void>;
   updateIssueTitle: (issueId: string, title: string) => Promise<void>;
   updateIssueCycle: (issueId: string, cycleId?: string) => Promise<void>;
   updateIssueReleases: (issueId: string, releaseIds: string[]) => Promise<void>;
   setIssueSubscription: (issueId: string, subscribed: boolean) => Promise<void>;
   setIssueFavorite: (issueId: string, favorite: boolean) => Promise<void>;
   setIssueReminder: (issueId: string, remindAt?: string) => Promise<void>;
   moveIssue: (issueId: string, teamId: string) => Promise<Issue>;
   classifyIssue: (
      issueId: string,
      resolution: 'DUPLICATE' | 'WONT_FIX',
      duplicateOfIdentifier?: string
   ) => Promise<Issue>;
   convertIssueToComment: (issueId: string, targetIdentifier: string) => Promise<string>;
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

const normalizedStatusName = (value: string) =>
   value
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, '-');

const statusIcon = (status: ApiStatus, category: StatusCategory) => {
   const normalizedId = normalizedStatusName(status.id);
   const normalizedName = normalizedStatusName(status.name);
   const presentation = statusPresentations.find(
      (candidate) =>
         normalizedStatusName(candidate.id) === normalizedId ||
         normalizedStatusName(candidate.name) === normalizedName
   );
   if (presentation) return presentation.icon;

   const Icon =
      category === 'completed'
         ? CircleCheck
         : category === 'canceled'
           ? CircleX
           : category === 'backlog' || category === 'triage'
             ? CircleDashed
             : Circle;
   return function FallbackStatusIcon() {
      return createElement(Icon, { className: 'size-4' });
   };
};

const mapStatus = (status: ApiStatus): Status => ({
   id: status.id,
   name: status.name,
   color: status.color,
   category: categoryFromApi(status.category),
   icon: statusIcon(status, categoryFromApi(status.category)),
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
         icon: statusIcon(
            {
               id: project.status,
               name: project.status,
               color: '#8f9299',
               category: 'unstarted',
            },
            'unstarted'
         ),
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
   isFavorite: Boolean(issue.favorites?.length),
   reminderAt: issue.reminders?.[0]?.remindAt,
   resolution: issue.resolution ?? undefined,
   duplicateOfId: issue.duplicateOfId ?? undefined,
   hasActivity: Boolean(issue.activities?.length),
   cycleId: issue.cycleLinks[0]?.cycleId ?? '',
   releaseIds: issue.releaseLinks.map((link) => link.releaseId),
   project: issue.project ? mapProject(issue.project) : undefined,
   rank: issue.createdAt,
   dueDate: issue.dueDate ?? undefined,
});

const issueState = (issues: Issue[]) => ({ issues, issuesByStatus: groupIssuesByStatus(issues) });

const patchIssue = async (issueId: string, workspaceId: string | undefined, data: unknown) => {
   if (!workspaceId) throw new Error('No workspace is available.');
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
   releases: [],
   templates: [],
   teams: [],
   isLoading: false,
   getAllIssues: () => get().issues,

   loadIssues: async (teamIdentifier) => {
      set({ isLoading: true, error: undefined });
      try {
         const workspaceId = (await loadCurrentWorkspace()).id;

         const teamsResponse = await fetch(`${api}/teams?workspaceId=${workspaceId}`, {
            credentials: 'include',
         });
         if (!teamsResponse.ok) throw new Error('Could not load teams.');
         const teamsData = (await teamsResponse.json()) as {
            data: IssueTeamOption[];
         };
         const joinedTeams = teamsData.data.filter((item) => item.joined);
         const team = teamIdentifier
            ? joinedTeams.find(
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
            releases: optionsData.data.releases,
            templates: optionsData.data.templates,
            teams: joinedTeams,
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
            releases: [],
            templates: [],
            teams: [],
            currentUserId: undefined,
            isLoading: false,
            error: caught instanceof Error ? caught.message : 'Could not load issues.',
         });
      }
   },

   createIssue: async (input) => {
      const { workspaceId, teamId } = get();
      const destinationTeamId = input.teamId ?? teamId;
      if (!workspaceId || !destinationTeamId)
         throw new Error('Open a team issue view before creating an issue.');
      const response = await fetch(`${api}/issues`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({
            workspaceId,
            teamId: destinationTeamId,
            ...input,
            priority: input.priority === 'no-priority' ? 'NONE' : input.priority?.toUpperCase(),
         }),
      });
      if (!response.ok) throw new Error('Could not create the issue.');
      const data = (await response.json()) as { data: ApiIssue };
      const issue = mapIssue(data.data);
      get().addIssue(issue);
      return issue;
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
   updateIssueStatus: async (issueId, newStatus) => {
      await patchIssue(issueId, get().workspaceId, { statusId: newStatus.id });
      get().updateIssue(issueId, { status: newStatus });
   },
   updateIssuePriority: async (issueId, newPriority) => {
      await patchIssue(issueId, get().workspaceId, { priority: newPriority.id.toUpperCase() });
      get().updateIssue(issueId, { priority: newPriority });
   },
   updateIssueAssignee: async (issueId, newAssignee) => {
      await patchIssue(issueId, get().workspaceId, { assigneeId: newAssignee?.id ?? null });
      get().updateIssue(issueId, { assignee: newAssignee });
   },
   addIssueLabel: async (issueId, label) => {
      const issue = get().getIssueById(issueId);
      if (!issue) throw new Error('Issue not found.');
      if (issue.labels.some((candidate) => candidate.id === label.id)) return;
      const labels = [...issue.labels, label];
      await patchIssue(issueId, get().workspaceId, { labelIds: labels.map((item) => item.id) });
      get().updateIssue(issueId, { labels });
   },
   removeIssueLabel: async (issueId, labelId) => {
      const issue = get().getIssueById(issueId);
      if (!issue) throw new Error('Issue not found.');
      const labels = issue.labels.filter((label) => label.id !== labelId);
      await patchIssue(issueId, get().workspaceId, { labelIds: labels.map((item) => item.id) });
      get().updateIssue(issueId, { labels });
   },
   updateIssueProject: async (issueId, newProject) => {
      await patchIssue(issueId, get().workspaceId, { projectId: newProject?.id ?? null });
      get().updateIssue(issueId, { project: newProject });
   },
   updateIssueDueDate: async (issueId, dueDate) => {
      await patchIssue(issueId, get().workspaceId, { dueDate: dueDate ?? null });
      get().updateIssue(issueId, { dueDate });
   },
   updateIssueTitle: async (issueId, title) => {
      await patchIssue(issueId, get().workspaceId, { title });
      get().updateIssue(issueId, { title });
   },
   updateIssueCycle: async (issueId, cycleId) => {
      const workspaceId = get().workspaceId;
      const issue = get().getIssueById(issueId);
      if (!workspaceId) throw new Error('No workspace is available.');
      if (!issue) throw new Error('Issue not found.');
      if (issue.cycleId === (cycleId ?? '')) return;

      if (cycleId) {
         const addResponse = await fetch(`${api}/cycles/${cycleId}/issues`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, issueId }),
         });
         if (!addResponse.ok) throw new Error('Could not add the issue to this cycle.');
      }
      if (issue.cycleId) {
         const removeResponse = await fetch(
            `${api}/cycles/${issue.cycleId}/issues/${issueId}?workspaceId=${workspaceId}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!removeResponse.ok)
            throw new Error('Could not remove the issue from its current cycle.');
      }
      get().updateIssue(issueId, { cycleId: cycleId ?? '' });
   },
   updateIssueReleases: async (issueId, releaseIds) => {
      const uniqueReleaseIds = [...new Set(releaseIds)];
      await patchIssue(issueId, get().workspaceId, { releaseIds: uniqueReleaseIds });
      get().updateIssue(issueId, { releaseIds: uniqueReleaseIds });
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
   setIssueFavorite: async (issueId, favorite) => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) throw new Error('No workspace is available.');
      const response = await fetch(`${api}/issues/${issueId}/favorite?workspaceId=${workspaceId}`, {
         method: favorite ? 'POST' : 'DELETE',
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not update favorite.');
      get().updateIssue(issueId, { isFavorite: favorite });
   },
   setIssueReminder: async (issueId, remindAt) => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) throw new Error('No workspace is available.');
      const response = await fetch(
         `${api}/issues/${issueId}/reminder${remindAt ? '' : `?workspaceId=${workspaceId}`}`,
         remindAt
            ? {
                 method: 'POST',
                 credentials: 'include',
                 headers: { 'content-type': 'application/json' },
                 body: JSON.stringify({ workspaceId, remindAt }),
              }
            : { method: 'DELETE', credentials: 'include' }
      );
      if (!response.ok) throw new Error('Could not update reminder.');
      get().updateIssue(issueId, { reminderAt: remindAt });
   },
   moveIssue: async (issueId, destinationTeamId) => {
      const { workspaceId, teamId } = get();
      if (!workspaceId) throw new Error('No workspace is available.');
      const current = get().getIssueById(issueId);
      if (!current) throw new Error('Issue not found.');
      const response = await fetch(`${api}/issues/${issueId}/move`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, teamId: destinationTeamId }),
      });
      if (!response.ok) throw new Error('Could not move issue.');
      const payload = (await response.json()) as { data: ApiIssue };
      const moved = {
         ...mapIssue(payload.data),
         isSubscribed: current.isSubscribed,
         isFavorite: current.isFavorite,
         reminderAt: current.reminderAt,
      };
      if (teamId && teamId !== destinationTeamId) get().deleteIssue(issueId);
      else get().updateIssue(issueId, moved);
      return moved;
   },
   classifyIssue: async (issueId, resolution, duplicateOfIdentifier) => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) throw new Error('No workspace is available.');
      const response = await fetch(`${api}/issues/${issueId}/classification`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, resolution, duplicateOfIdentifier }),
      });
      if (!response.ok) throw new Error('Could not classify issue.');
      const payload = (await response.json()) as { data: ApiIssue };
      const current = get().getIssueById(issueId);
      const classified = {
         ...mapIssue(payload.data),
         isSubscribed: current?.isSubscribed,
         isFavorite: current?.isFavorite,
         reminderAt: current?.reminderAt,
      };
      get().updateIssue(issueId, classified);
      return classified;
   },
   convertIssueToComment: async (issueId, targetIdentifier) => {
      const workspaceId = get().workspaceId;
      if (!workspaceId) throw new Error('No workspace is available.');
      const response = await fetch(`${api}/issues/${issueId}/convert-to-comment`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, targetIdentifier }),
      });
      if (!response.ok) throw new Error('Could not convert the issue to a comment.');
      const payload = (await response.json()) as { data: { targetIdentifier: string } };
      get().deleteIssue(issueId);
      return payload.data.targetIdentifier;
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
