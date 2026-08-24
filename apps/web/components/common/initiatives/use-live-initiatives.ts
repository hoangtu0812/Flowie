'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadCurrentWorkspace } from '@/lib/workspaces';

export type LiveInitiativeProject = {
   id: string;
   name: string;
   identifier: string;
   status: string;
   priority: string;
   health: string;
   targetDate: string | null;
   startDate: string | null;
   createdAt: string;
   team: { id: string; name: string; identifier: string; icon: string | null } | null;
   lead: { id: string; name: string; avatarUrl: string | null } | null;
   issues: Array<{ id: string; status: { category: string } }>;
};

export type LiveInitiative = {
   id: string;
   name: string;
   description: string | null;
   status: string;
   priority: string;
   health: string;
   icon: string | null;
   targetDate: string | null;
   createdAt: string;
   updatedAt: string;
   owner: { id: string; name: string; avatarUrl: string | null } | null;
   projectLinks: Array<{ project: LiveInitiativeProject }>;
   _count: { projectLinks: number };
};

export type LiveWorkspaceProject = LiveInitiativeProject;
export type LiveInitiativeActivity = {
   id: string;
   action: string;
   metadata: Record<string, unknown>;
   createdAt: string;
   actor: { id: string; name: string; avatarUrl: string | null } | null;
};
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function useLiveInitiatives() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [initiatives, setInitiatives] = useState<LiveInitiative[]>([]);
   const [projects, setProjects] = useState<LiveWorkspaceProject[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();
   const [refreshKey, setRefreshKey] = useState(0);
   useEffect(() => {
      let current = true;
      void (async () => {
         setLoading(true);
         setError(undefined);
         try {
            const currentWorkspaceId = (await loadCurrentWorkspace()).id;
            const [initiativeResponse, projectResponse] = await Promise.all([
               fetch(`${api}/initiatives?workspaceId=${currentWorkspaceId}`, {
                  credentials: 'include',
               }),
               fetch(`${api}/projects?workspaceId=${currentWorkspaceId}`, {
                  credentials: 'include',
               }),
            ]);
            if (!initiativeResponse.ok || !projectResponse.ok)
               throw new Error('Could not load initiatives.');
            if (current) {
               setWorkspaceId(currentWorkspaceId);
               setInitiatives(
                  ((await initiativeResponse.json()) as { data: LiveInitiative[] }).data
               );
               setProjects(
                  ((await projectResponse.json()) as { data: LiveWorkspaceProject[] }).data
               );
            }
         } catch (caught) {
            if (current)
               setError(caught instanceof Error ? caught.message : 'Could not load initiatives.');
         } finally {
            if (current) setLoading(false);
         }
      })();
      return () => {
         current = false;
      };
   }, [refreshKey]);
   const reload = useCallback(() => setRefreshKey((value) => value + 1), []);
   return { workspaceId, initiatives, projects, loading, error, reload };
}

export function useInitiativeActivity(initiativeId?: string, workspaceId?: string) {
   const [activities, setActivities] = useState<LiveInitiativeActivity[]>([]);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string>();
   const [refreshKey, setRefreshKey] = useState(0);
   useEffect(() => {
      if (!initiativeId || !workspaceId) return;
      let current = true;
      setLoading(true);
      setError(undefined);
      const query = new URLSearchParams({ workspaceId });
      void fetch(`${api}/initiatives/${initiativeId}/activity?${query}`, {
         credentials: 'include',
      })
         .then(async (response) => {
            if (!response.ok) throw new Error('Could not load initiative activity.');
            const payload = (await response.json()) as { data: LiveInitiativeActivity[] };
            if (current) setActivities(payload.data);
         })
         .catch((caught) => {
            if (current)
               setError(
                  caught instanceof Error ? caught.message : 'Could not load initiative activity.'
               );
         })
         .finally(() => {
            if (current) setLoading(false);
         });
      return () => {
         current = false;
      };
   }, [initiativeId, workspaceId, refreshKey]);
   const reload = useCallback(() => setRefreshKey((value) => value + 1), []);
   return { activities, loading, error, reload };
}
