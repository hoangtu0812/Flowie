'use client';

import { loadCurrentWorkspace } from '@/lib/workspaces';

export type TeamMember = {
   id: string;
   name: string;
   avatarUrl: string | null;
   role: string;
};

export type WorkspaceTeam = {
   id: string;
   identifier: string;
   name: string;
   icon: string | null;
   color: string | null;
   joined: boolean;
   members: TeamMember[];
   projectCount: number;
   cycleCount: number;
   createdAt: string;
   updatedAt: string;
   description?: string | null;
   triageEnabled: boolean;
   cycleCadenceWeeks: number | null;
   autoCloseDays: number | null;
   autoArchiveDays: number | null;
   parentTeamId: string | null;
   defaultIssueTemplateId: string | null;
};

export type DeletedWorkspaceTeam = Pick<WorkspaceTeam, 'id' | 'name' | 'identifier' | 'icon'> & {
   deletedAt: string;
};

type ApiTeam = Omit<WorkspaceTeam, 'members' | 'projectCount' | 'cycleCount'> & {
   members: Array<{ role: string; user: Omit<TeamMember, 'role'> }>;
   _count: { projects: number; cycles: number };
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export async function loadCurrentWorkspaceTeams(): Promise<{
   workspaceId: string;
   teams: WorkspaceTeam[];
}> {
   const workspaceId = (await loadCurrentWorkspace()).id;

   const teamsResponse = await fetch(`${api}/teams?workspaceId=${workspaceId}`, {
      credentials: 'include',
   });
   if (!teamsResponse.ok) throw new Error('Could not load teams.');

   const payload = (await teamsResponse.json()) as { data: ApiTeam[] };
   return {
      workspaceId,
      teams: payload.data.map((team) => ({
         ...team,
         members: team.members.map((member) => ({ ...member.user, role: member.role })),
         projectCount: team._count.projects,
         cycleCount: team._count.cycles,
      })),
   };
}

export async function loadJoinedWorkspaceTeams(): Promise<{
   workspaceId: string;
   teams: WorkspaceTeam[];
}> {
   const workspace = await loadCurrentWorkspaceTeams();
   return { ...workspace, teams: workspace.teams.filter((team) => team.joined) };
}

export async function createWorkspaceTeam(input: {
   workspaceId: string;
   name: string;
   identifier: string;
}) {
   const response = await fetch(`${api}/teams`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
   });
   if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? 'Could not create team.');
   }
   return response.json();
}

export async function joinWorkspaceTeam(workspaceId: string, teamId: string) {
   const query = new URLSearchParams({ workspaceId });
   const response = await fetch(`${api}/teams/${teamId}/join?${query}`, {
      method: 'POST',
      credentials: 'include',
   });
   if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? 'Could not join team.');
   }
   return response.json();
}

export async function leaveWorkspaceTeam(workspaceId: string, teamId: string) {
   const query = new URLSearchParams({ workspaceId });
   const response = await fetch(`${api}/teams/${teamId}/leave?${query}`, {
      method: 'POST',
      credentials: 'include',
   });
   if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? 'Could not leave this team.');
   }
   return response.json();
}

export async function loadDeletedWorkspaceTeams(
   workspaceId: string
): Promise<DeletedWorkspaceTeam[]> {
   const query = new URLSearchParams({ workspaceId });
   const response = await fetch(`${api}/teams/deleted?${query}`, { credentials: 'include' });
   if (!response.ok) throw new Error('Could not load recently deleted teams.');
   return ((await response.json()) as { data: DeletedWorkspaceTeam[] }).data;
}

export async function restoreWorkspaceTeam(workspaceId: string, teamId: string) {
   const query = new URLSearchParams({ workspaceId });
   const response = await fetch(`${api}/teams/${teamId}/restore?${query}`, {
      method: 'POST',
      credentials: 'include',
   });
   if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? 'Could not restore this team.');
   }
   return response.json();
}
