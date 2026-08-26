'use client';

import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';

export type LiveView = {
   id: string;
   name: string;
   description: string | null;
   entityType: 'issue' | 'project';
   filters: Record<string, unknown>;
   isShared: boolean;
   createdAt: string;
   updatedAt: string;
   createdBy: { id: string; name: string; avatarUrl: string | null };
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

async function workspaceIdForCurrentUser() {
   return (await loadCurrentWorkspace()).id;
}

export function useLiveViews() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [currentUserId, setCurrentUserId] = useState<string>();
   const [views, setViews] = useState<LiveView[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();
   const [refreshKey, setRefreshKey] = useState(0);

   useEffect(() => {
      let current = true;
      void (async () => {
         setLoading(true);
         setError(undefined);
         try {
            const currentWorkspaceId = await workspaceIdForCurrentUser();
            const [response, userResponse] = await Promise.all([
               authenticatedFetch(`${api}/views?workspaceId=${currentWorkspaceId}`),
               authenticatedFetch(`${api}/users/me`),
            ]);
            if (!response.ok || !userResponse.ok) throw new Error('Could not load views.');
            if (current) {
               setWorkspaceId(currentWorkspaceId);
               setViews(((await response.json()) as { data: LiveView[] }).data);
               setCurrentUserId(((await userResponse.json()) as { data: { id: string } }).data.id);
            }
         } catch (caught) {
            if (current)
               setError(caught instanceof Error ? caught.message : 'Could not load views.');
         } finally {
            if (current) setLoading(false);
         }
      })();
      return () => {
         current = false;
      };
   }, [refreshKey]);

   const reload = useCallback(() => setRefreshKey((value) => value + 1), []);
   return { workspaceId, currentUserId, views, loading, error, reload };
}
