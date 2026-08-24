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
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Shared live data source for the three unchanged Project detail tabs. */
export function useLiveProject(projectId: string) {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [project, setProject] = useState<LiveProject>();
   const [issues, setIssues] = useState<LiveProjectIssue[]>([]);
   const [milestones, setMilestones] = useState<LiveMilestone[]>([]);
   const [activities, setActivities] = useState<LiveActivity[]>([]);
   const [updates, setUpdates] = useState<LiveProjectUpdate[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();

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
            ]);
            if (
               !projectResponse.ok ||
               !issuesResponse.ok ||
               !milestonesResponse.ok ||
               !activitiesResponse.ok ||
               !updatesResponse.ok
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
   }, [projectId]);

   const createUpdate = useCallback(
      async (body: string, health: string, kind: 'update' | 'comment') => {
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
         return created;
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
      loading,
      error,
      createUpdate,
   };
}
