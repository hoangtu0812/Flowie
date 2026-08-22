'use client';

import { useEffect, useState } from 'react';

type Team = {
   id: string;
   identifier: string;
   name: string;
   icon: string | null;
   color: string | null;
   members: Array<{ user: { id: string; name: string; avatarUrl: string | null } }>;
};

export function RealTeams() {
   const [teams, setTeams] = useState<Team[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   useEffect(() => {
      const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
      void fetch(`${api}/workspaces/me`, { credentials: 'include' })
         .then((response) => (response.ok ? response.json() : Promise.reject()))
         .then((workspaces: { data: Array<{ workspace: { id: string } }> }) =>
            fetch(`${api}/teams?workspaceId=${workspaces.data[0]?.workspace.id}`, {
               credentials: 'include',
            })
         )
         .then((response) => (response.ok ? response.json() : Promise.reject()))
         .then((payload: { data: Team[] }) => {
            setTeams(payload.data);
            setState('ready');
         })
         .catch(() => setState('error'));
   }, []);
   if (state === 'loading')
      return <p className="p-6 text-sm text-muted-foreground">Loading teams…</p>;
   if (state === 'error')
      return <p className="p-6 text-sm text-destructive">Could not load teams.</p>;
   if (!teams.length)
      return (
         <p className="p-6 text-sm text-muted-foreground">
            No teams yet. Create a team to get started.
         </p>
      );
   return (
      <div className="divide-y">
         {teams.map((team) => (
            <div key={team.id} className="flex items-center gap-3 px-6 py-3">
               <span
                  className="flex size-7 items-center justify-center rounded bg-muted"
                  style={{ borderColor: team.color ?? undefined }}
               >
                  {team.icon ?? '👥'}
               </span>
               <div className="min-w-0 flex-1">
                  <p className="font-medium">{team.name}</p>
                  <p className="text-xs text-muted-foreground">{team.identifier}</p>
               </div>
               <span className="text-sm text-muted-foreground">{team.members.length} members</span>
            </div>
         ))}
      </div>
   );
}
