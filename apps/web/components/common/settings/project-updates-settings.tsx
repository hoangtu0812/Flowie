'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashedSmiley } from './settings-placeholder';

type ProjectUpdate = {
   id: string;
   body: string;
   createdAt: string;
   project: { id: string; name: string; identifier: string };
   author: { id: string; name: string; avatarUrl: string | null };
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const formatDate = (value: string) =>
   new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value)
   );

export default function ProjectUpdatesSettings() {
   const [updates, setUpdates] = useState<ProjectUpdate[]>([]);
   const [query, setQuery] = useState('');
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspacePayload = (await workspaceResponse.json()) as {
         data: Array<{ workspace: { id: string } }>;
      };
      const workspaceId = workspacePayload.data[0]?.workspace.id;
      if (!workspaceId) throw new Error('No workspace is available.');
      const response = await fetch(`${api}/projects/updates?workspaceId=${workspaceId}`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not load project updates.');
      setUpdates(((await response.json()) as { data: ProjectUpdate[] }).data);
   }, []);
   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);
   const filtered = useMemo(() => {
      const term = query.trim().toLowerCase();
      return updates.filter(
         (update) =>
            !term ||
            update.body.toLowerCase().includes(term) ||
            update.project.name.toLowerCase().includes(term) ||
            update.author.name.toLowerCase().includes(term)
      );
   }, [query, updates]);
   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-2xl font-medium">Project updates</h1>
            <p className="text-sm text-muted-foreground mt-1">
               Review project updates collected across the workspace
            </p>
            <div className="mt-6">
               <Input
                  placeholder="Filter by project, author or update..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-72 h-8"
               />
            </div>
            {state === 'loading' && (
               <p className="py-12 text-sm text-muted-foreground">Loading project updates…</p>
            )}
            {state === 'error' && (
               <p className="py-12 text-sm text-destructive">Could not load project updates.</p>
            )}
            {state === 'ready' && filtered.length === 0 && (
               <div className="flex flex-col items-center justify-center gap-5 py-32">
                  <DashedSmiley />
                  <p className="text-sm text-muted-foreground">
                     {updates.length
                        ? 'No project updates match your filter.'
                        : 'No project updates'}
                  </p>
               </div>
            )}
            {state === 'ready' && filtered.length > 0 && (
               <div className="mt-5 overflow-hidden rounded-lg border bg-container">
                  {filtered.map((update) => (
                     <div key={update.id} className="flex gap-3 px-4 py-3 border-b last:border-b-0">
                        <Avatar className="size-7 shrink-0">
                           <AvatarImage
                              src={update.author.avatarUrl ?? undefined}
                              alt={update.author.name}
                           />
                           <AvatarFallback className="text-[10px]">
                              {update.author.name[0]}
                           </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0 flex-1">
                           <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium truncate">
                                 {update.project.name}
                              </span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                 {formatDate(update.createdAt)}
                              </span>
                           </div>
                           <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-1">
                              {update.body}
                           </p>
                           <p className="text-xs text-muted-foreground mt-1">
                              {update.author.name}
                           </p>
                        </div>
                     </div>
                  ))}
               </div>
            )}
         </div>
      </div>
   );
}
