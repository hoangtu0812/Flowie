'use client';

import { useEffect, useState } from 'react';

type Team = {
   id: string;
   name: string;
   identifier: string;
   description: string | null;
   icon: string | null;
   color: string | null;
   members: Array<{
      role: string;
      user: { id: string; name: string; email: string; avatarUrl: string | null };
   }>;
   _count: { issues: number; projects: number; cycles: number };
};

export function RealTeamDetail({ teamId, view }: { teamId: string; view: 'overview' | 'members' }) {
   const [team, setTeam] = useState<Team>();
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   useEffect(() => {
      const load = async () => {
         const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
         if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
         const workspace = (await workspaceResponse.json()) as {
            data: Array<{ workspace: { id: string } }>;
         };
         const workspaceId = workspace.data[0]?.workspace.id;
         if (!workspaceId) throw new Error('No workspace is available.');
         const response = await fetch(`${api}/teams/${teamId}?workspaceId=${workspaceId}`, {
            credentials: 'include',
         });
         if (!response.ok) throw new Error('Could not load team.');
         setTeam(((await response.json()) as { data: Team }).data);
      };
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [api, teamId]);
   if (state === 'loading')
      return <p className="p-6 text-sm text-muted-foreground">Loading team…</p>;
   if (state === 'error' || !team)
      return <p className="p-6 text-sm text-destructive">Could not load this team.</p>;
   if (view === 'members')
      return (
         <section className="mx-auto w-full max-w-4xl p-6">
            <h1 className="mb-5 text-xl font-semibold">{team.name} members</h1>
            <div className="overflow-hidden rounded-md border">
               {team.members.map((member) => (
                  <div
                     className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                     key={member.user.id}
                  >
                     <span className="grid h-8 w-8 place-items-center rounded-full bg-muted text-xs font-medium">
                        {member.user.name.slice(0, 1).toUpperCase()}
                     </span>
                     <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{member.user.name}</p>
                        <p className="text-xs text-muted-foreground">{member.user.email}</p>
                     </div>
                     <span className="text-xs text-muted-foreground">
                        {member.role.toLowerCase()}
                     </span>
                  </div>
               ))}
            </div>
         </section>
      );
   return (
      <section className="mx-auto w-full max-w-4xl p-6">
         <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-md bg-muted text-xl">
               {team.icon ?? '👥'}
            </span>
            <div>
               <p className="text-sm text-muted-foreground">{team.identifier}</p>
               <h1 className="text-xl font-semibold">{team.name}</h1>
            </div>
         </div>
         <p className="mt-5 text-sm text-muted-foreground">
            {team.description || 'No team description yet.'}
         </p>
         <dl className="mt-8 grid gap-4 sm:grid-cols-3">
            <div className="rounded-md border p-4">
               <dt className="text-xs text-muted-foreground">Members</dt>
               <dd className="mt-1 text-xl font-semibold">{team.members.length}</dd>
            </div>
            <div className="rounded-md border p-4">
               <dt className="text-xs text-muted-foreground">Issues</dt>
               <dd className="mt-1 text-xl font-semibold">{team._count.issues}</dd>
            </div>
            <div className="rounded-md border p-4">
               <dt className="text-xs text-muted-foreground">Projects</dt>
               <dd className="mt-1 text-xl font-semibold">{team._count.projects}</dd>
            </div>
         </dl>
      </section>
   );
}
