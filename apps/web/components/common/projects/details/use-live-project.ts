'use client';

import { useCallback, useEffect, useState } from 'react';

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

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Shared live data source for the three unchanged Project detail tabs. */
export function useLiveProject(projectId: string) {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [project, setProject] = useState<LiveProject>();
   const [issues, setIssues] = useState<LiveProjectIssue[]>([]);
   const [milestones, setMilestones] = useState<LiveMilestone[]>([]);
   const [activities, setActivities] = useState<LiveActivity[]>([]);
   const [updates, setUpdates] = useState<LiveProjectUpdate[]>([]);
   const [availableLabels, setAvailableLabels] = useState<LiveProjectLabel[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();
   const [refreshKey, setRefreshKey] = useState(0);

   useEffect(() => {
      let current = true;
      void (async () => {
         setLoading(true);
         setError(undefined);
         try {
            const workspaceResponse = await fetch(`${api}/workspaces/me`, {
               credentials: 'include',
            });
            if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
            const workspacePayload = (await workspaceResponse.json()) as {
               data: Array<{ workspace: { id: string } }>;
            };
            const workspaceId = workspacePayload.data[0]?.workspace.id;
            if (!workspaceId) throw new Error('No workspace is available.');
            const query = new URLSearchParams({ workspaceId });
            const [
               projectResponse,
               issuesResponse,
               milestonesResponse,
               activitiesResponse,
               updatesResponse,
               labelsResponse,
            ] = await Promise.all([
               fetch(`${api}/projects/${projectId}?${query}`, { credentials: 'include' }),
               fetch(`${api}/projects/${projectId}/issues?${query}`, { credentials: 'include' }),
               fetch(`${api}/projects/${projectId}/milestones?${query}`, {
                  credentials: 'include',
               }),
               fetch(`${api}/activities?${new URLSearchParams({ workspaceId, projectId })}`, {
                  credentials: 'include',
               }),
               fetch(`${api}/projects/${projectId}/updates?${query}`, {
                  credentials: 'include',
               }),
               fetch(`${api}/projects/labels?${query}`, { credentials: 'include' }),
            ]);
            if (
               !projectResponse.ok ||
               !issuesResponse.ok ||
               !milestonesResponse.ok ||
               !activitiesResponse.ok ||
               !updatesResponse.ok ||
               !labelsResponse.ok
            ) {
               throw new Error('Could not load project details.');
            }
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
         } catch (caught) {
            if (current)
               setError(caught instanceof Error ? caught.message : 'Could not load project.');
         } finally {
            if (current) setLoading(false);
         }
      })();
      return () => {
         current = false;
      };
   }, [projectId, refreshKey]);

   const reload = useCallback(() => setRefreshKey((value) => value + 1), []);

   const createUpdate = useCallback(
      async (body: string, health: string, kind: 'update' | 'comment', attachment?: File) => {
         if (!workspaceId) throw new Error('Workspace is not available yet.');
         const response = await fetch(`${api}/projects/${projectId}/updates`, {
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
         const uploadResponse = await fetch(`${api}/attachments`, {
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

   const updateLabels = useCallback(
      async (labelIds: string[]) => {
         if (!workspaceId) throw new Error('Workspace is not available yet.');
         const query = new URLSearchParams({ workspaceId });
         const response = await fetch(`${api}/projects/${projectId}?${query}`, {
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

   const createMilestone = useCallback(
      async (title: string, targetDate?: string) => {
         if (!workspaceId) throw new Error('Workspace is not available yet.');
         const response = await fetch(`${api}/projects/${projectId}/milestones`, {
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
         const response = await fetch(
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
         const response = await fetch(
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
      loading,
      error,
      createUpdate,
      updateLabels,
      createMilestone,
      toggleMilestone,
      toggleFavorite,
      reload,
   };
}
