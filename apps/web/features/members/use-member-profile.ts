'use client';

import { useEffect, useState } from 'react';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import type { User } from '@/types/users';

export type MemberProfileData = {
   id: string;
   name: string;
   email: string;
   avatarUrl: string | null;
   timezone: string;
   joinedAt: string;
   workspaceRole: 'OWNER' | 'ADMIN' | 'MEMBER' | 'ADMIN_VIEWER';
   lastSeenAt: string | null;
   isOnline: boolean;
   teams: Array<{ id: string; name: string; identifier: string; icon: string | null }>;
   projects: Array<{ id: string; name: string; identifier: string }>;
};

export function profileUser(member: MemberProfileData): User {
   return {
      ...member,
      avatarUrl: member.avatarUrl ?? '',
      status: member.isOnline ? 'online' : 'offline',
      role: member.workspaceRole === 'MEMBER' ? 'Member' : 'Admin',
      joinedDate: member.joinedAt,
      teamIds: member.teams.map((team) => team.id),
   };
}

export function useMemberProfile(memberId: string) {
   const [member, setMember] = useState<MemberProfileData>();
   const [error, setError] = useState<string>();
   const [loading, setLoading] = useState(true);
   const [reload, setReload] = useState(0);
   useEffect(() => {
      let active = true;
      setLoading(true);
      setError(undefined);
      setMember(undefined);
      void loadCurrentWorkspace()
         .then((workspace) =>
            authenticatedFetch(
               `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/users/${encodeURIComponent(memberId)}?workspaceId=${encodeURIComponent(workspace.id)}`
            )
         )
         .then((response) =>
            responseData<MemberProfileData>(response, 'This member profile is not available.')
         )
         .then((result) => {
            if (active) setMember(result);
         })
         .catch((caught: unknown) => {
            if (active)
               setError(
                  caught instanceof Error ? caught.message : 'Could not load member profile.'
               );
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [memberId, reload]);
   return { member, loading, error, retry: () => setReload((value) => value + 1) };
}
