'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Plus } from 'lucide-react';

type Team = {
   id: string;
   identifier: string;
   name: string;
   icon: string | null;
   color: string | null;
   members: Array<{ user: { id: string; name: string; avatarUrl: string | null } }>;
};

export function RealTeams() {
   const { orgId } = useParams<{ orgId: string }>();
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
   return (
      <section>
         <div className="flex items-center justify-between gap-4 border-b px-6 py-3">
            <p className="text-sm text-muted-foreground">{teams.length} team</p>
            <Link
               className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
               href={`/${orgId}/settings/teams/new`}
            >
               <Plus className="mr-1.5 size-4" /> Tạo team
            </Link>
         </div>
         {!teams.length ? (
            <div className="space-y-3 p-6 text-sm text-muted-foreground">
               <p>Chưa có team nào trong workspace này.</p>
               <Link
                  className="font-medium text-primary underline"
                  href={`/${orgId}/settings/teams/new`}
               >
                  Tạo team đầu tiên
               </Link>
            </div>
         ) : (
            <div className="divide-y">
               {teams.map((team) => (
                  <Link
                     href={`/${orgId}/team/${team.id}/all`}
                     key={team.id}
                     className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/50"
                  >
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
                     <span className="text-sm text-muted-foreground">
                        {team.members.length} members
                     </span>
                  </Link>
               ))}
            </div>
         )}
      </section>
   );
}
