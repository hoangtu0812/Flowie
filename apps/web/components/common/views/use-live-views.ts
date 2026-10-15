'use client';

import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData, ApiRequestError } from '@/lib/http';
import { useParams } from 'next/navigation';

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
   const { orgId } = useParams<{ orgId: string }>();
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [currentUserId, setCurrentUserId] = useState<string>();
   const [views, setViews] = useState<LiveView[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();
   const [errorStatus, setErrorStatus] = useState<number>();
   const [refreshKey, setRefreshKey] = useState(0);

   useEffect(() => {
      let current = true;
      setViews([]);
      setWorkspaceId(undefined);
      setCurrentUserId(undefined);
      void (async () => {
         setLoading(true);
         setError(undefined);
         setErrorStatus(undefined);
         try {
            const currentWorkspaceId = await workspaceIdForCurrentUser();
            const [response, userResponse] = await Promise.all([
               authenticatedFetch(`${api}/views?workspaceId=${currentWorkspaceId}`),
               authenticatedFetch(`${api}/users/me`),
            ]);
            const data = await responseData<LiveView[]>(response, 'Could not load views.');
            const account = await responseData<{ id: string }>(userResponse);
            if (current) {
               setWorkspaceId(currentWorkspaceId);
               setViews(data);
               setCurrentUserId(account.id);
            }
         } catch (caught) {
            if (current) {
               setError(caught instanceof Error ? caught.message : 'Could not load views.');
               setErrorStatus(caught instanceof ApiRequestError ? caught.status : 0);
            }
         } finally {
            if (current) setLoading(false);
         }
      })();
      return () => {
         current = false;
      };
   }, [orgId, refreshKey]);

   useEffect(() => {
      const refresh = () => setRefreshKey((value) => value + 1);
      window.addEventListener('flowie:views-changed', refresh);
      return () => window.removeEventListener('flowie:views-changed', refresh);
   }, []);
   const reload = useCallback(() => window.dispatchEvent(new Event('flowie:views-changed')), []);
   return { workspaceId, currentUserId, views, loading, error, errorStatus, reload };
}
