'use client';

import {
   createContext,
   createElement,
   type ReactNode,
   useCallback,
   useContext,
   useEffect,
   useRef,
   useState,
} from 'react';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { useIssuesStore } from '@/store/issues-store';

export type LiveProject = {
   id: string;
   name: string;
   identifier: string;
   description: string | null;
   status: string;
   priority: string;
   health: string;
   startDate: string | null;
   targetDate: string | null;
   createdAt: string;
   team: { id: string; name: string; identifier: string; icon: string | null } | null;
   lead: { id: string; name: string; avatarUrl: string | null } | null;
   _count: { issues: number };
   initiativeLinks: Array<{ initiative: { id: string; name: string } }>;
   labelLinks: Array<{ label: { id: string; name: string; color: string } }>;
   favorites: Array<{ userId: string }>;
   resources: Array<{
      id: string;
      label: string;
      url: string;
      createdAt: string;
      createdBy: { id: string; name: string; avatarUrl: string | null };
   }>;
   members: LiveProjectMember[];
};

export type LiveProjectMember = {
   createdAt: string;
   user: { id: string; name: string; avatarUrl: string | null };
};

export type LiveWorkspaceMember = {
   userId: string;
   status: 'ACTIVE' | 'INVITED' | 'SUSPENDED';
   user: { id: string; name: string; avatarUrl: string | null };
};

export type LiveProjectIssue = {
   id: string;
   identifier: string;
   title: string;
   description: string | null;
   priority: string;
   createdAt: string;
   rank: string;
   dueDate: string | null;
   status: { id: string; name: string; category: string; color: string };
   team: { id: string; name: string; identifier: string };
   creator: { id: string; name: string; avatarUrl: string | null };
   assignee: { id: string; name: string; avatarUrl: string | null } | null;
   labelLinks: Array<{ label: { id: string; name: string; color: string } }>;
   cycleLinks: Array<{ cycle: { id: string; name: string } }>;
};

export type LiveMilestone = {
   id: string;
   title: string;
   targetDate: string | null;
   completedAt: string | null;
};

export type LiveActivity = {
   id: string;
   type: string;
   createdAt: string;
   actor: { id: string; name: string; avatarUrl: string | null } | null;
};

export type LiveProjectUpdate = {
   id: string;
   body: string;
   kind: 'update' | 'comment';
   health: string | null;
   createdAt: string;
   author: { id: string; name: string; avatarUrl: string | null };
   attachments: Array<{
      id: string;
      filename: string;
      mimeType: string;
      size: number;
   }>;
};

export type LiveProjectLabel = { id: string; name: string; color: string };
export type LiveProjectInitiative = { id: string; name: string };
export type LiveProjectStatus = { id: string; name: string; color: string; category: string };
export type LiveWorkspaceTeam = {
   id: string;
   name: string;
   identifier: string;
   icon: string | null;
   joined: boolean;
};

export type LiveProjectCustomField = {
   id: string;
   name: string;
   type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'MULTI_SELECT' | 'BOOLEAN' | 'URL';
   description: string | null;
   options: string[] | null;
   required: boolean;
   position: number;
   value: unknown;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type LiveProjectData = ReturnType<typeof useLiveProject>;
const LiveProjectContext = createContext<LiveProjectData | null>(null);

/** Shared live data source for the three unchanged Project detail tabs. */
export function useLiveProject(projectId: string) {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [project, setProject] = useState<LiveProject>();
   const [issues, setIssues] = useState<LiveProjectIssue[]>([]);
   const [milestones, setMilestones] = useState<LiveMilestone[]>([]);
   const [activities, setActivities] = useState<LiveActivity[]>([]);
   const [updates, setUpdates] = useState<LiveProjectUpdate[]>([]);
   const [availableLabels, setAvailableLabels] = useState<LiveProjectLabel[]>([]);
   const [availableInitiatives, setAvailableInitiatives] = useState<LiveProjectInitiative[]>([]);
   const [availableStatuses, setAvailableStatuses] = useState<LiveProjectStatus[]>([]);
   const [customFields, setCustomFields] = useState<LiveProjectCustomField[]>([]);
   const [availableMembers, setAvailableMembers] = useState<LiveWorkspaceMember[]>([]);
   const [availableTeams, setAvailableTeams] = useState<LiveWorkspaceTeam[]>([]);
   const [loading, setLoading] = useState(true);
   /** A refetch keeps the current screen on screen instead of blanking it. */
   const loadedOnce = useRef(false);
   const [error, setError] = useState<string>();
   const [refreshKey, setRefreshKey] = useState(0);

   useEffect(() => {
      let current = true;
      void (async () => {
         if (!loadedOnce.current) setLoading(true);
         setError(undefined);
         try {
            const workspaceId = (await loadCurrentWorkspace()).id;
            const query = new URLSearchParams({ workspaceId });
            // Every Project detail tab needs all of these, so the page fails as a
            // whole. Keep the label next to the URL: a failing request has to name
            // itself, otherwise a single generic message hides which endpoint (and
            // which service behind the API) rejected the session.
            const endpoints: Array<[string, string]> = [
               ['details', `${api}/projects/${projectId}?${query}`],
               ['issues', `${api}/projects/${projectId}/issues?${query}`],
               ['milestones', `${api}/projects/${projectId}/milestones?${query}`],
               ['activity', `${api}/activities?${new URLSearchParams({ workspaceId, projectId })}`],
               ['updates', `${api}/projects/${projectId}/updates?${query}`],
               ['labels', `${api}/projects/labels?${query}`],
               ['custom fields', `${api}/projects/${projectId}/custom-fields?${query}`],
               ['initiatives', `${api}/initiatives?${query}`],
               ['members', `${api}/workspaces/${workspaceId}/members`],
               ['statuses', `${api}/projects/statuses?${query}`],
               ['teams', `${api}/teams?${query}`],
            ];
            const responses = await Promise.all(
               endpoints.map(([, url]) => authenticatedFetch(url))
            );
            const failed = responses.findIndex((response) => !response.ok);
            if (failed !== -1) {
               const response = responses[failed];
               const payload = (await response.json().catch(() => null)) as {
                  message?: string;
               } | null;
               throw new Error(
                  `Could not load project ${endpoints[failed][0]} (${response.status} ${payload?.message ?? response.statusText}).`
               );
            }
            const [
               projectResponse,
               issuesResponse,
               milestonesResponse,
               activitiesResponse,
               updatesResponse,
               labelsResponse,
               customFieldsResponse,
               initiativesResponse,
               membersResponse,
               statusesResponse,
               teamsResponse,
            ] = responses;
            if (!current) return;
            setWorkspaceId(workspaceId);
            setProject(((await projectResponse.json()) as { data: LiveProject }).data);
            setIssues(((await issuesResponse.json()) as { data: LiveProjectIssue[] }).data);
            setMilestones(((await milestonesResponse.json()) as { data: LiveMilestone[] }).data);
            setActivities(((await activitiesResponse.json()) as { data: LiveActivity[] }).data);
            setUpdates(((await updatesResponse.json()) as { data: LiveProjectUpdate[] }).data);
            setAvailableLabels(
               ((await labelsResponse.json()) as { data: LiveProjectLabel[] }).data
            );
            setCustomFields(
               ((await customFieldsResponse.json()) as { data: LiveProjectCustomField[] }).data
            );
            setAvailableInitiatives(
               ((await initiativesResponse.json()) as { data: LiveProjectInitiative[] }).data
            );
            setAvailableMembers(
               ((await membersResponse.json()) as { data: LiveWorkspaceMember[] }).data.filter(
                  (member) => member.status === 'ACTIVE'
               )
            );
            setAvailableStatuses(
               ((await statusesResponse.json()) as { data: LiveProjectStatus[] }).data
            );
            setAvailableTeams(
               ((await teamsResponse.json()) as { data: LiveWorkspaceTeam[] }).data.filter(
                  (team) => team.joined
               )
            );
         } catch (caught) {
            if (current)
               setError(caught instanceof Error ? caught.message : 'Could not load project.');
         } finally {
            if (current) {
               loadedOnce.current = true;
               setLoading(false);
            }
         }
      })();
      return () => {
         current = false;
      };
   }, [projectId, refreshKey]);

   const reload = useCallback(() => setRefreshKey((value) => value + 1), []);

   // Every issue mutation in the app lands in the issues store, including the
   // ones started from the command palette or a context menu. Following that
   // store keeps this screen from showing a list the user already changed.
   useEffect(
      () =>
         useIssuesStore.subscribe((state, previous) => {
            if (state.issues !== previous.issues) reload();
         }),
      [reload]
   );

   const createUpdate = useCallback(
      async (body: string, health: string, kind: 'update' | 'comment', attachment?: File) => {
         if (!workspaceId) throw new Error('Workspace is not available yet.');
         const response = await authenticatedFetch(`${api}/projects/${projectId}/updates`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, body, health, kind }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not post project update.');
         }
         const created = ((await response.json()) as { data: LiveProjectUpdate }).data;
         setUpdates((current) => [created, ...current]);
         if (!attachment) return created;

         const form = new FormData();
         form.set('workspaceId', workspaceId);
         form.set('entityType', 'project-update');
         form.set('entityId', created.id);
         form.set('file', attachment);
         const uploadResponse = await authenticatedFetch(`${api}/attachments`, {
            method: 'POST',
            credentials: 'include',
            body: form,
         });
         if (!uploadResponse.ok) {
            throw new Error('Project update was posted, but its attachment could not be uploaded.');
         }
         const uploaded = (await uploadResponse.json()) as {
            data: { id: string; filename: string; mimeType: string; size: number };
         };
         const withAttachment = { ...created, attachments: [uploaded.data] };
         setUpdates((current) =>
            current.map((update) => (update.id === created.id ? withAttachment : update))
         );
         return withAttachment;
      },
      [projectId, workspaceId]
   );

   const updateProject = useCallback(
      async (data: Record<string, unknown>) => {
         if (!workspaceId) throw new Error('Workspace is not available yet.');
         const query = new URLSearchParams({ workspaceId });
         const response = await authenticatedFetch(`${api}/projects/${projectId}?${query}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(data),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string | string[];
            } | null;
            throw new Error(
               Array.isArray(payload?.message)
                  ? payload.message.join(' ')
                  : (payload?.message ?? 'Could not update the project.')
            );
         }
         const updated = ((await response.json()) as { data: LiveProject }).data;
         setProject((current) => ({
            ...updated,
            favorites: updated.favorites ?? current?.favorites ?? [],
         }));
         return updated;
      },
      [projectId, workspaceId]
   );

   const createResource = useCallback(
      async (label: string, url: string) => {
         if (!workspaceId) throw new Error('Workspace is not available yet.');
         const response = await authenticatedFetch(`${api}/projects/${projectId}/resources`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, label: label.trim(), url: url.trim() }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not add project resource.');
         }
         const created = (
            (await response.json()) as {
               data: LiveProject['resources'][number];
            }
         ).data;
         setProject((current) =>
            current ? { ...current, resources: [...current.resources, created] } : current
         );
         return created;
      },
      [projectId, workspaceId]
   );

   const updateLabels = useCallback(
      async (labelIds: string[]) => {
         if (!workspaceId) throw new Error('Workspace is not available yet.');
         const query = new URLSearchParams({ workspaceId });
         const response = await authenticatedFetch(`${api}/projects/${projectId}?${query}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ labelIds }),
         });
         if (!response.ok) throw new Error('Could not update project labels.');
         const updated = ((await response.json()) as { data: LiveProject }).data;
         setProject((current) => ({
            ...updated,
            favorites: updated.favorites ?? current?.favorites ?? [],
         }));
      },
      [projectId, workspaceId]
   );

   const updateCustomFields = useCallback(
      async (values: Record<string, unknown>) => {
         if (!workspaceId) throw new Error('Workspace is not available yet.');
         const changedFields = customFields.filter(
            (field) =>
               JSON.stringify(field.value ?? null) !== JSON.stringify(values[field.id] ?? null)
         );
         const updated = await Promise.all(
            changedFields.map(async (field) => {
               const response = await authenticatedFetch(
                  `${api}/projects/${projectId}/custom-fields/${field.id}`,
                  {
                     method: 'PATCH',
                     credentials: 'include',
                     headers: { 'content-type': 'application/json' },
                     body: JSON.stringify({ workspaceId, value: values[field.id] ?? null }),
                  }
               );
               if (!response.ok) {
                  const payload = (await response.json().catch(() => null)) as {
                     message?: string;
                  } | null;
                  throw new Error(payload?.message ?? `Could not update ${field.name}.`);
               }
               return ((await response.json()) as { data: LiveProjectCustomField }).data;
            })
         );
         const updatedById = new Map(updated.map((field) => [field.id, field]));
         setCustomFields((current) => current.map((field) => updatedById.get(field.id) ?? field));
         return updated;
      },
      [customFields, projectId, workspaceId]
   );

   const updateInitiatives = useCallback(
      async (initiativeIds: string[]) => {
         if (!workspaceId || !project) throw new Error('Project is not available yet.');
         const currentIds = new Set(project.initiativeLinks.map((link) => link.initiative.id));
         const requestedIds = new Set(initiativeIds);
         const removals = [...currentIds].filter((id) => !requestedIds.has(id));
         const additions = [...requestedIds].filter((id) => !currentIds.has(id));
         const responses = await Promise.all([
            ...removals.map((initiativeId) =>
               authenticatedFetch(
                  `${api}/initiatives/${initiativeId}/projects/${projectId}?${new URLSearchParams({ workspaceId })}`,
                  { method: 'DELETE', credentials: 'include' }
               )
            ),
            ...additions.map((initiativeId) =>
               authenticatedFetch(`${api}/initiatives/${initiativeId}/projects`, {
                  method: 'POST',
                  credentials: 'include',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ workspaceId, projectId }),
               })
            ),
         ]);
         const failed = responses.find((response) => !response.ok);
         if (failed) {
            const payload = (await failed.json().catch(() => null)) as {
               message?: string;
            } | null;
            reload();
            throw new Error(payload?.message ?? 'Could not update project initiatives.');
         }
         reload();
      },
      [project, projectId, reload, workspaceId]
   );

   const updateMembers = useCallback(
      async (userIds: string[]) => {
         if (!workspaceId) throw new Error('Workspace is not available yet.');
         const response = await authenticatedFetch(`${api}/projects/${projectId}/members`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, userIds }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update project members.');
         }
         const members = ((await response.json()) as { data: LiveProjectMember[] }).data;
         setProject((current) => (current ? { ...current, members } : current));
      },
      [projectId, workspaceId]
   );

   const createMilestone = useCallback(
      async (title: string, targetDate?: string) => {
         if (!workspaceId) throw new Error('Workspace is not available yet.');
         const response = await authenticatedFetch(`${api}/projects/${projectId}/milestones`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, title: title.trim(), targetDate }),
         });
         if (!response.ok) throw new Error('Could not create milestone.');
         const created = ((await response.json()) as { data: LiveMilestone }).data;
         setMilestones((current) => [...current, created]);
         return created;
      },
      [projectId, workspaceId]
   );

   const toggleMilestone = useCallback(
      async (milestoneId: string, completed: boolean) => {
         if (!workspaceId) throw new Error('Workspace is not available yet.');
         const query = new URLSearchParams({ workspaceId });
         const response = await authenticatedFetch(
            `${api}/projects/${projectId}/milestones/${milestoneId}?${query}`,
            {
               method: 'PATCH',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ completed }),
            }
         );
         if (!response.ok) throw new Error('Could not update milestone.');
         const updated = ((await response.json()) as { data: LiveMilestone }).data;
         setMilestones((current) =>
            current.map((milestone) => (milestone.id === updated.id ? updated : milestone))
         );
      },
      [projectId, workspaceId]
   );

   const toggleFavorite = useCallback(
      async (favorite: boolean) => {
         if (!workspaceId) throw new Error('Workspace is not available yet.');
         const response = await authenticatedFetch(
            `${api}/projects/${projectId}/favorite?${new URLSearchParams({ workspaceId })}`,
            { method: favorite ? 'POST' : 'DELETE', credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not update project favorite.');
         setProject((current) =>
            current ? { ...current, favorites: favorite ? [{ userId: 'current' }] : [] } : current
         );
      },
      [projectId, workspaceId]
   );

   return {
      workspaceId,
      project,
      issues,
      milestones,
      activities,
      updates,
      availableLabels,
      availableInitiatives,
      availableStatuses,
      availableMembers,
      availableTeams,
      customFields,
      loading,
      error,
      createUpdate,
      createResource,
      updateProject,
      updateLabels,
      updateCustomFields,
      updateInitiatives,
      updateMembers,
      createMilestone,
      toggleMilestone,
      toggleFavorite,
      reload,
   };
}

export function LiveProjectProvider({
   projectId,
   children,
}: {
   projectId: string;
   children: ReactNode;
}) {
   const value = useLiveProject(projectId);
   return createElement(LiveProjectContext.Provider, { value }, children);
}

export function useLiveProjectData() {
   const value = useContext(LiveProjectContext);
   if (!value) throw new Error('useLiveProjectData must be used inside LiveProjectProvider.');
   return value;
}
