'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

type Scope = 'assigned' | 'created';
type Issue = {
   id: string;
   identifier: string;
   title: string;
   status: { name: string; color: string };
   team: { name: string };
   assignee: { name: string } | null;
};

export function RealMyIssues() {
   const [scope, setScope] = useState<Scope>('assigned');
   const [issues, setIssues] = useState<Issue[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const { orgId } = useParams<{ orgId: string }>();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

   useEffect(() => {
      const load = async () => {
         setState('loading');
         const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
         if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
         const workspace = (await workspaceResponse.json()) as {
            data: Array<{ workspace: { id: string } }>;
         };
         const workspaceId = workspace.data[0]?.workspace.id;
         if (!workspaceId) throw new Error('No workspace is available.');
         const response = await fetch(
            `${api}/issues?${new URLSearchParams({ workspaceId, scope })}`,
            { credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not load issues.');
         setIssues(((await response.json()) as { data: Issue[] }).data);
      };
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [api, scope]);

   return (
      <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
         <div className="mb-4 flex items-center justify-between gap-4">
            <div className="flex gap-2">
               <button
                  className={
                     scope === 'assigned'
                        ? 'rounded-md bg-muted px-3 py-2 text-sm font-medium'
                        : 'px-3 py-2 text-sm text-muted-foreground'
                  }
                  onClick={() => setScope('assigned')}
                  type="button"
               >
                  Assigned
               </button>
               <button
                  className={
                     scope === 'created'
                        ? 'rounded-md bg-muted px-3 py-2 text-sm font-medium'
                        : 'px-3 py-2 text-sm text-muted-foreground'
                  }
                  onClick={() => setScope('created')}
                  type="button"
               >
                  Created
               </button>
            </div>
            <span className="text-sm text-muted-foreground">{issues.length} issues</span>
         </div>
         {state === 'loading' ? (
            <p className="text-sm text-muted-foreground">Loading issues…</p>
         ) : state === 'error' ? (
            <p className="text-sm text-destructive">Could not load your issues.</p>
         ) : !issues.length ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
               No {scope} issues yet.
            </div>
         ) : (
            <div className="overflow-hidden rounded-md border">
               {issues.map((issue) => (
                  <Link
                     className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                     href={`/${orgId}/issue/${issue.id}`}
                     key={issue.id}
                  >
                     <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: issue.status.color }}
                     />
                     <span className="min-w-0 flex-1 truncate text-sm">{issue.title}</span>
                     <span className="hidden text-xs text-muted-foreground sm:block">
                        {issue.team.name}
                     </span>
                     <span className="text-xs text-muted-foreground">{issue.identifier}</span>
                  </Link>
               ))}
            </div>
         )}
      </section>
   );
}
