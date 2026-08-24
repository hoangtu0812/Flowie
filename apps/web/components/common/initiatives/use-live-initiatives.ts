'use client';

import { useCallback, useEffect, useState } from 'react';

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
            const workspaceResponse = await fetch(`${api}/workspaces/me`, {
               credentials: 'include',
            });
            if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
            const workspacePayload = (await workspaceResponse.json()) as {
               data: Array<{ workspace: { id: string } }>;
            };
            const currentWorkspaceId = workspacePayload.data[0]?.workspace.id;
            if (!currentWorkspaceId) throw new Error('No workspace is available.');
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
