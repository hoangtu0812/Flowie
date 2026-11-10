'use client';

import { useCallback, useEffect, useState } from 'react';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData, ApiRequestError } from '@/lib/http';
import { useParams } from 'next/navigation';
import { loadJoinedWorkspaceTeams } from '@/components/common/teams/team-types';

export type LiveView = {
   id: string;
   name: string;
   description: string | null;
   entityType: 'issue' | 'project';
   filters: Record<string, unknown>;
   isShared: boolean;
   createdAt: string;
   updatedAt: string;
   configurationError?: string | null;
   createdBy: { id: string; name: string; avatarUrl: string | null };
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

async function workspaceIdForCurrentUser() {
   return (await loadCurrentWorkspace()).id;
}

export function useLiveViews(teamReference?: string) {
   const { orgId } = useParams<{ orgId: string }>();
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [currentUserId, setCurrentUserId] = useState<string>();
   const [teamId, setTeamId] = useState<string>();
   const [teamNames, setTeamNames] = useState<Record<string, string>>({});
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
      setTeamId(undefined);
      setTeamNames({});
      void (async () => {
         setLoading(true);
         setError(undefined);
         setErrorStatus(undefined);
         try {
            const currentWorkspaceId = await workspaceIdForCurrentUser();
            let resolvedTeam: string | undefined;
            const joined = await loadJoinedWorkspaceTeams();
            if (teamReference) {
               resolvedTeam = joined.teams.find(
                  (team) => team.id === teamReference || team.identifier === teamReference
               )?.id;
               if (!resolvedTeam)
                  throw new Error('This team is not available to the current account.');
            }
            const [response, userResponse] = await Promise.all([
               authenticatedFetch(
                  `${api}/views?${new URLSearchParams({ workspaceId: currentWorkspaceId, ...(resolvedTeam ? { teamId: resolvedTeam } : {}) })}`
               ),
               authenticatedFetch(`${api}/users/me`),
            ]);
            const data = await responseData<LiveView[]>(response, 'Could not load views.');
            const account = await responseData<{ id: string }>(userResponse);
            if (current) {
               setWorkspaceId(currentWorkspaceId);
               setViews(data);
               setCurrentUserId(account.id);
               setTeamId(resolvedTeam);
               setTeamNames(Object.fromEntries(joined.teams.map((team) => [team.id, team.name])));
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
   }, [orgId, refreshKey, teamReference]);

   useEffect(() => {
      const refresh = () => setRefreshKey((value) => value + 1);
      window.addEventListener('flowie:views-changed', refresh);
      return () => window.removeEventListener('flowie:views-changed', refresh);
   }, []);
   const reload = useCallback(() => window.dispatchEvent(new Event('flowie:views-changed')), []);
   return {
      workspaceId,
      currentUserId,
      teamId,
      teamNames,
      views,
      loading,
      error,
      errorStatus,
      reload,
   };
}
