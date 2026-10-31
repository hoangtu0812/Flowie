'use client';
import { useEffect, useState } from 'react';
import {
   authenticatedFetch,
   loadCurrentWorkspaceMembership,
   managesWorkspace,
} from '@/lib/workspaces';
import { responseData } from '@/lib/http';

export function useWorkspaceTeams(org: string) {
   const [result, setResult] = useState<{
      org: string;
      workspace?: string;
      manager?: boolean;
      teams?: { id: string; name: string }[];
      error?: string;
   }>();
   const [retry, setRetry] = useState(0);
   useEffect(() => {
      let active = true;
      void (async () => {
         const member = await loadCurrentWorkspaceMembership(org);
         const teams = await responseData<{ id: string; name: string; joined: boolean }[]>(
            await authenticatedFetch(
               `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/teams?workspaceId=${member.workspace.id}`
            )
         );
         if (active)
            setResult({
               org,
               workspace: member.workspace.id,
               manager: managesWorkspace(member.role),
               teams: teams.filter((row) => row.joined),
            });
      })().catch((reason) => {
         if (active)
            setResult({
               org,
               error: reason instanceof Error ? reason.message : 'Could not load workspace.',
            });
      });
      return () => {
         active = false;
      };
   }, [org, retry]);
   return {
      ...(result?.org === org ? result : undefined),
      reload: () => setRetry((value) => value + 1),
   };
}
