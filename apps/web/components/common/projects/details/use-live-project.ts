'use client';

import { useEffect, useState } from 'react';

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
};

export type LiveProjectIssue = {
   id: string;
   identifier: string;
   title: string;
   priority: string;
   createdAt: string;
   status: { id: string; name: string; category: string; color: string };
   assignee: { id: string; name: string; avatarUrl: string | null } | null;
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

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Shared live data source for the three unchanged Project detail tabs. */
export function useLiveProject(projectId: string) {
   const [project, setProject] = useState<LiveProject>();
   const [issues, setIssues] = useState<LiveProjectIssue[]>([]);
   const [milestones, setMilestones] = useState<LiveMilestone[]>([]);
   const [activities, setActivities] = useState<LiveActivity[]>([]);
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
            const [projectResponse, issuesResponse, milestonesResponse, activitiesResponse] =
               await Promise.all([
                  fetch(`${api}/projects/${projectId}?${query}`, { credentials: 'include' }),
                  fetch(`${api}/projects/${projectId}/issues?${query}`, { credentials: 'include' }),
                  fetch(`${api}/projects/${projectId}/milestones?${query}`, {
                     credentials: 'include',
                  }),
                  fetch(`${api}/activities?${new URLSearchParams({ workspaceId, projectId })}`, {
                     credentials: 'include',
                  }),
               ]);
            if (
               !projectResponse.ok ||
               !issuesResponse.ok ||
               !milestonesResponse.ok ||
               !activitiesResponse.ok
            ) {
               throw new Error('Could not load project details.');
            }
            if (!current) return;
            setProject(((await projectResponse.json()) as { data: LiveProject }).data);
            setIssues(((await issuesResponse.json()) as { data: LiveProjectIssue[] }).data);
            setMilestones(((await milestonesResponse.json()) as { data: LiveMilestone[] }).data);
            setActivities(((await activitiesResponse.json()) as { data: LiveActivity[] }).data);
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

   return { project, issues, milestones, activities, loading, error };
}
