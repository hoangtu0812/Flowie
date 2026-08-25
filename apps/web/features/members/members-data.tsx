'use client';

import {
   authenticatedFetch,
   loadCurrentWorkspace,
   loadCurrentWorkspaceMembership,
} from '@/lib/workspaces';
import type { User } from '@/types/users';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type ApiMember = {
   id: string;
   userId: string;
   status: 'ACTIVE' | 'INVITED';
   role: 'OWNER' | 'ADMIN' | 'MEMBER';
   joinedAt: string | null;
   createdAt: string;
   user: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
      timezone: string;
   };
};

type ApiTeam = {
   id: string;
   identifier: string;
   members: Array<{ user: { id: string } }>;
};

type MemberData = {
   workspaceId?: string;
   workspaceLoading: boolean;
   members: User[];
   canInvite: boolean;
   canChangeRole: boolean;
   canRemove: boolean;
   inviteMember: (email: string, role: 'MEMBER' | 'ADMIN') => Promise<void>;
   changeMemberRole: (member: User, role: 'MEMBER' | 'ADMIN') => Promise<void>;
   removeMember: (member: User) => Promise<void>;
};

const MembersDataContext = createContext<MemberData | null>(null);

const roleLabel = (role: ApiMember['role']): User['role'] =>
   role === 'ADMIN' || role === 'OWNER' ? 'Admin' : 'Member';

function useMembersDataSource(): MemberData {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [workspaceLoading, setWorkspaceLoading] = useState(true);
   const [members, setMembers] = useState<User[]>([]);
   const [workspaceRole, setWorkspaceRole] = useState<'OWNER' | 'ADMIN' | 'MEMBER'>('MEMBER');

   const load = useCallback(async () => {
      const workspaceMembership = await loadCurrentWorkspace();
      const memberships = await authenticatedFetch(
         `${api}/workspaces/${workspaceMembership.id}/members`
      );
      const teams = await authenticatedFetch(`${api}/teams?workspaceId=${workspaceMembership.id}`);
      if (!memberships.ok || !teams.ok) throw new Error('Could not load workspace members.');
      const membersPayload = (await memberships.json()) as { data: ApiMember[] };
      const teamsPayload = (await teams.json()) as { data: ApiTeam[] };
      const memberTeams = new Map<string, string[]>();
      for (const team of teamsPayload.data) {
         for (const teamMember of team.members) {
            memberTeams.set(teamMember.user.id, [
               ...(memberTeams.get(teamMember.user.id) ?? []),
               team.identifier,
            ]);
         }
      }
      setWorkspaceId(workspaceMembership.id);
      setMembers(
         membersPayload.data.map((member) => ({
            id: member.user.id,
            name: member.user.name,
            avatarUrl: member.user.avatarUrl ?? '',
            email: member.user.email,
            status: 'offline',
            role: roleLabel(member.role),
            joinedDate: member.joinedAt ?? member.createdAt,
            teamIds: memberTeams.get(member.userId) ?? [],
            timezone: member.user.timezone,
            workspaceMemberId: member.id,
            workspaceRole: member.role,
            membershipStatus: member.status,
         }))
      );
   }, []);

   useEffect(() => {
      let active = true;
      setWorkspaceLoading(true);
      void (async () => {
         const membership = await loadCurrentWorkspaceMembership();
         if (!active) return;
         setWorkspaceRole(membership.role);
         await load();
      })()
         .catch((error: unknown) => {
            if (active) {
               setWorkspaceId(undefined);
               setMembers([]);
               toast.error(
                  error instanceof Error ? error.message : 'Could not load workspace members.'
               );
            }
         })
         .finally(() => {
            if (active) setWorkspaceLoading(false);
         });
      return () => {
         active = false;
      };
   }, [load]);

   const inviteMember = useCallback(
      async (email: string, role: 'MEMBER' | 'ADMIN') => {
         if (!workspaceId) throw new Error('Workspace is not ready yet.');
         const response = await authenticatedFetch(`${api}/workspaces/${workspaceId}/invitations`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email: email.trim(), role }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not invite this person.');
         }
         await load();
      },
      [load, workspaceId]
   );

   const changeMemberRole = useCallback(
      async (member: User, role: 'MEMBER' | 'ADMIN') => {
         if (!workspaceId || !member.workspaceMemberId)
            throw new Error('Workspace member is not ready yet.');
         const response = await authenticatedFetch(
            `${api}/workspaces/${workspaceId}/members/${member.workspaceMemberId}`,
            {
               method: 'PATCH',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({ role }),
            }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not update member role.');
         }
         await load();
      },
      [load, workspaceId]
   );

   const removeMember = useCallback(
      async (member: User) => {
         if (!workspaceId || !member.workspaceMemberId)
            throw new Error('Workspace member is not ready yet.');
         const response = await authenticatedFetch(
            `${api}/workspaces/${workspaceId}/members/${member.workspaceMemberId}`,
            { method: 'DELETE' }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not remove this member.');
         }
         setMembers((current) => current.filter((item) => item.id !== member.id));
      },
      [workspaceId]
   );

   return {
      workspaceId,
      workspaceLoading,
      members,
      canInvite: workspaceRole === 'OWNER' || workspaceRole === 'ADMIN',
      canChangeRole: workspaceRole === 'OWNER',
      canRemove: workspaceRole === 'OWNER' || workspaceRole === 'ADMIN',
      inviteMember,
      changeMemberRole,
      removeMember,
   };
}

export function MembersDataProvider({ children }: { children: ReactNode }) {
   return (
      <MembersDataContext.Provider value={useMembersDataSource()}>
         {children}
      </MembersDataContext.Provider>
   );
}

export function useMembersData(): MemberData {
   const value = useContext(MembersDataContext);
   if (!value) throw new Error('useMembersData must be used inside MembersDataProvider.');
   return value;
}
