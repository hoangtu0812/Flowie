'use client';

import { FormEvent, useEffect, useState } from 'react';

type Cycle = {
   id: string;
   name: string;
   description: string | null;
   status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELED';
   startDate: string | null;
   endDate: string | null;
   _count: { issueLinks: number };
};

type CycleIssue = {
   id: string;
   identifier: string;
   title: string;
   status: { name: string; color: string };
   assignee: { name: string } | null;
};

const statusLabel: Record<Cycle['status'], string> = {
   UPCOMING: 'Upcoming',
   ACTIVE: 'Active',
   COMPLETED: 'Completed',
   CANCELED: 'Canceled',
};

function formatDate(value: string | null) {
   return value
      ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value))
      : 'No date';
}

export function RealCycles({ teamId, status }: { teamId: string; status?: Cycle['status'] }) {
   const [cycles, setCycles] = useState<Cycle[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [creating, setCreating] = useState(false);
   const [name, setName] = useState('');
   const [createError, setCreateError] = useState<string>();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

   const loadCycles = async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspaceData = (await workspaceResponse.json()) as {
         data: Array<{ workspace: { id: string } }>;
      };
      const currentWorkspaceId = workspaceData.data[0]?.workspace.id;
      if (!currentWorkspaceId) throw new Error('No workspace is available.');
      setWorkspaceId(currentWorkspaceId);
      const query = new URLSearchParams({ workspaceId: currentWorkspaceId, teamId });
      if (status) query.set('status', status);
      const cycleResponse = await fetch(`${api}/cycles?${query.toString()}`, {
         credentials: 'include',
      });
      if (!cycleResponse.ok) throw new Error('Could not load cycles.');
      const cycleData = (await cycleResponse.json()) as { data: Cycle[] };
      setCycles(cycleData.data);
   };

   useEffect(() => {
      void loadCycles()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
      // The route parameters identify a distinct cycle view.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [teamId, status]);

   const createCycle = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || name.trim().length < 2) return;
      setCreateError(undefined);
      const response = await fetch(`${api}/cycles`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, teamId, name: name.trim(), status: 'UPCOMING' }),
      });
      if (!response.ok) {
         setCreateError('Could not create the cycle.');
         return;
      }
      setName('');
      setCreating(false);
      await loadCycles();
   };

   if (state === 'loading')
      return <p className="p-6 text-sm text-muted-foreground">Loading cycles…</p>;
   if (state === 'error')
      return <p className="p-6 text-sm text-destructive">Could not load cycles for this team.</p>;

   return (
      <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
         <div className="mb-4 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">{cycles.length} cycles</p>
            {!status && (
               <button
                  className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                  onClick={() => setCreating((value) => !value)}
                  type="button"
               >
                  New cycle
               </button>
            )}
         </div>
         {creating && (
            <form className="mb-4 rounded-md border bg-card p-3" onSubmit={createCycle}>
               <label className="sr-only" htmlFor="cycle-name">
                  Cycle name
               </label>
               <div className="flex gap-2">
                  <input
                     autoFocus
                     className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                     id="cycle-name"
                     onChange={(event) => setName(event.target.value)}
                     placeholder="Cycle name"
                     value={name}
                  />
                  <button
                     className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                     disabled={name.trim().length < 2}
                     type="submit"
                  >
                     Create
                  </button>
               </div>
               {createError && <p className="mt-2 text-xs text-destructive">{createError}</p>}
            </form>
         )}
         {!cycles.length ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
               No cycles in this view yet.
            </div>
         ) : (
            <div className="overflow-hidden rounded-md border">
               {cycles.map((cycle) => (
                  <CycleRow cycle={cycle} key={cycle.id} workspaceId={workspaceId!} api={api} />
               ))}
            </div>
         )}
      </section>
   );
}

function CycleRow({ cycle, workspaceId, api }: { cycle: Cycle; workspaceId: string; api: string }) {
   const [expanded, setExpanded] = useState(false);
   const [issues, setIssues] = useState<CycleIssue[]>([]);
   const [loading, setLoading] = useState(false);

   const toggleIssues = async () => {
      const nextExpanded = !expanded;
      setExpanded(nextExpanded);
      if (!nextExpanded || issues.length) return;
      setLoading(true);
      try {
         const response = await fetch(
            `${api}/cycles/${cycle.id}/issues?workspaceId=${workspaceId}`,
            { credentials: 'include' }
         );
         if (response.ok) setIssues(((await response.json()) as { data: CycleIssue[] }).data);
      } finally {
         setLoading(false);
      }
   };

   return (
      <article className="border-b px-4 py-3 last:border-0">
         <div className="flex items-center justify-between gap-3">
            <button className="min-w-0 text-left" onClick={() => void toggleIssues()} type="button">
               <p className="truncate text-sm font-medium">{cycle.name}</p>
               <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(cycle.startDate)} – {formatDate(cycle.endDate)} ·{' '}
                  {cycle._count.issueLinks} issues
               </p>
            </button>
            <span className="rounded bg-muted px-2 py-1 text-xs">{statusLabel[cycle.status]}</span>
         </div>
         {expanded && (
            <div className="mt-3 border-t pt-3">
               {loading ? (
                  <p className="text-xs text-muted-foreground">Loading cycle issues…</p>
               ) : issues.length ? (
                  <ul className="space-y-2">
                     {issues.map((issue) => (
                        <li className="flex items-center gap-2 text-sm" key={issue.id}>
                           <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: issue.status.color }}
                           />
                           <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                           <span className="text-xs text-muted-foreground">{issue.identifier}</span>
                        </li>
                     ))}
                  </ul>
               ) : (
                  <p className="text-xs text-muted-foreground">No issues assigned to this cycle.</p>
               )}
            </div>
         )}
      </article>
   );
}
