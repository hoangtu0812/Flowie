'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Label = {
   id: string;
   name: string;
   color: string;
   description: string | null;
   createdAt: string;
   _count: { issueLinks: number };
};

export function RealLabelsSettings() {
   const [labels, setLabels] = useState<Label[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [showForm, setShowForm] = useState(false);
   const [name, setName] = useState('');
   const [color, setColor] = useState('#6366f1');
   const [error, setError] = useState<string>();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspace = (await workspaceResponse.json()) as {
         data: Array<{ workspace: { id: string } }>;
      };
      const currentWorkspaceId = workspace.data[0]?.workspace.id;
      if (!currentWorkspaceId) throw new Error('No workspace is available.');
      setWorkspaceId(currentWorkspaceId);
      const response = await fetch(`${api}/labels?workspaceId=${currentWorkspaceId}`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not load labels.');
      setLabels(((await response.json()) as { data: Label[] }).data);
   }, [api]);
   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);

   const create = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !name.trim()) return;
      setError(undefined);
      const response = await fetch(`${api}/labels`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, name: name.trim(), color }),
      });
      if (!response.ok) {
         setError('Could not create label.');
         return;
      }
      setName('');
      setShowForm(false);
      await load();
   };

   return (
      <section className="mx-auto w-full max-w-5xl p-6">
         <div className="mb-6 flex items-center justify-between gap-4">
            <div>
               <h1 className="text-xl font-semibold">Issue labels</h1>
               <p className="mt-1 text-sm text-muted-foreground">
                  Labels are shared across this workspace.
               </p>
            </div>
            <button
               className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
               onClick={() => setShowForm((value) => !value)}
               type="button"
            >
               New label
            </button>
         </div>
         {showForm && (
            <form
               className="mb-4 flex flex-wrap items-center gap-2 rounded-md border p-3"
               onSubmit={create}
            >
               <input
                  aria-label="Label name"
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Label name"
                  value={name}
               />
               <input
                  aria-label="Label color"
                  className="h-9 w-12 rounded border bg-background p-1"
                  onChange={(event) => setColor(event.target.value)}
                  type="color"
                  value={color}
               />
               <button
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                  disabled={!name.trim()}
                  type="submit"
               >
                  Create
               </button>
               {error && <p className="text-xs text-destructive">{error}</p>}
            </form>
         )}
         {state === 'loading' ? (
            <p className="text-sm text-muted-foreground">Loading labels…</p>
         ) : state === 'error' ? (
            <p className="text-sm text-destructive">Could not load labels.</p>
         ) : !labels.length ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
               No labels yet.
            </div>
         ) : (
            <div className="overflow-hidden rounded-md border">
               {labels.map((label) => (
                  <div
                     className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                     key={label.id}
                  >
                     <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: label.color }}
                     />
                     <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{label.name}</p>
                        {label.description && (
                           <p className="text-xs text-muted-foreground">{label.description}</p>
                        )}
                     </div>
                     <span className="text-xs text-muted-foreground">
                        {label._count.issueLinks} issues
                     </span>
                  </div>
               ))}
            </div>
         )}
      </section>
   );
}
