'use client';

import { useEffect, useState } from 'react';
import { loadCurrentWorkspace } from '@/lib/workspaces';

export type LiveMember = {
   id: string;
   name: string;
   email: string;
   username: string | null;
   title: string | null;
   avatarUrl: string | null;
   createdAt: string;
   joinedAt: string;
   timezone: string;
   workspaceRole: 'OWNER' | 'ADMIN' | 'MEMBER';
   teams: Array<{
      id: string;
      name: string;
      identifier: string;
      icon: string | null;
      role: string;
   }>;
   projects: Array<{
      id: string;
      name: string;
      identifier: string;
   }>;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

async function currentWorkspaceId() {
   return (await loadCurrentWorkspace()).id;
}

export function useLiveMembers() {
   const [members, setMembers] = useState<LiveMember[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();

   useEffect(() => {
      let current = true;
      void (async () => {
         setLoading(true);
         setError(undefined);
         try {
            const workspaceId = await currentWorkspaceId();
            const response = await fetch(`${api}/users?workspaceId=${workspaceId}`, {
               credentials: 'include',
            });
            if (!response.ok) throw new Error('Could not load members.');
            if (current) setMembers(((await response.json()) as { data: LiveMember[] }).data);
         } catch (caught) {
            if (current)
               setError(caught instanceof Error ? caught.message : 'Could not load members.');
         } finally {
            if (current) setLoading(false);
         }
      })();
      return () => {
         current = false;
      };
   }, []);

   return { members, loading, error };
}

export function useLiveMember(memberId: string) {
   const [member, setMember] = useState<LiveMember>();
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();

   useEffect(() => {
      let current = true;
      void (async () => {
         setLoading(true);
         setError(undefined);
         try {
            const workspaceId = await currentWorkspaceId();
            const response = await fetch(`${api}/users/${memberId}?workspaceId=${workspaceId}`, {
               credentials: 'include',
            });
            if (!response.ok) throw new Error('Could not load member profile.');
            if (current) setMember(((await response.json()) as { data: LiveMember }).data);
         } catch (caught) {
            if (current)
               setError(
                  caught instanceof Error ? caught.message : 'Could not load member profile.'
               );
         } finally {
            if (current) setLoading(false);
         }
      })();
      return () => {
         current = false;
      };
   }, [memberId]);

   return { member, loading, error };
}
