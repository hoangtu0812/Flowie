'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type SavedView = {
   id: string;
   name: string;
   entityType: string;
   isShared: boolean;
   createdBy: { id: string; name: string };
};

export function RealViews() {
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [views, setViews] = useState<SavedView[]>([]);
   const [name, setName] = useState('');
   const [entityType, setEntityType] = useState<'issue' | 'project'>('issue');
   const [shared, setShared] = useState(false);
   const [error, setError] = useState<string>();

   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspaceId = (
         (await workspaceResponse.json()) as { data: Array<{ workspace: { id: string } }> }
      ).data[0]?.workspace.id;
      if (!workspaceId) throw new Error('No workspace is available.');
      setWorkspaceId(workspaceId);
      const response = await fetch(`${api}/views?workspaceId=${workspaceId}`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not load saved views.');
      setViews(((await response.json()) as { data: SavedView[] }).data);
   }, [api]);

   useEffect(() => {
      void load().catch(() => setError('Could not load saved views.'));
   }, [load]);

   const create = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || name.trim().length < 2) return;
      const response = await fetch(`${api}/views`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({
            workspaceId,
            name: name.trim(),
            entityType,
            isShared: shared,
            filters: {},
         }),
      });
      if (!response.ok) {
         setError('Could not create saved view.');
         return;
      }
      setName('');
      setShared(false);
      await load();
   };

   const remove = async (view: SavedView) => {
      if (!workspaceId || !window.confirm(`Delete view “${view.name}”?`)) return;
      const response = await fetch(`${api}/views/${view.id}?workspaceId=${workspaceId}`, {
         method: 'DELETE',
         credentials: 'include',
      });
      if (!response.ok) {
         setError('Only the creator can delete this view.');
         return;
      }
      await load();
   };

   return (
      <section className="mx-auto w-full max-w-4xl p-6">
         <div className="flex items-baseline justify-between gap-3">
            <div>
               <h1 className="text-xl font-semibold">Saved views</h1>
               <p className="mt-1 text-sm text-muted-foreground">
                  Save a project or issue filter for your workspace.
               </p>
            </div>
            <span className="text-xs text-muted-foreground">{views.length} views</span>
         </div>
         <form className="mt-6 flex flex-wrap gap-2 rounded-lg border p-3" onSubmit={create}>
            <input
               className="min-w-48 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
               onChange={(event) => setName(event.target.value)}
               placeholder="View name"
               value={name}
            />
            <select
               className="rounded-md border bg-background px-3 py-2 text-sm"
               onChange={(event) => setEntityType(event.target.value as 'issue' | 'project')}
               value={entityType}
            >
               <option value="issue">Issues</option>
               <option value="project">Projects</option>
            </select>
            <label className="flex items-center gap-2 px-2 text-sm">
               <input
                  checked={shared}
                  onChange={(event) => setShared(event.target.checked)}
                  type="checkbox"
               />
               Share
            </label>
            <button
               className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
               disabled={name.trim().length < 2}
               type="submit"
            >
               Save view
            </button>
         </form>
         {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
         <div className="mt-6 overflow-hidden rounded-lg border">
            {views.length ? (
               views.map((view) => (
                  <article
                     className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                     key={view.id}
                  >
                     <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{view.name}</p>
                        <p className="text-xs text-muted-foreground">
                           {view.entityType}s ·{' '}
                           {view.isShared ? 'shared' : `personal · ${view.createdBy.name}`}
                        </p>
                     </div>
                     <button
                        className="rounded border px-2 py-1 text-xs text-destructive"
                        onClick={() => void remove(view)}
                        type="button"
                     >
                        Delete
                     </button>
                  </article>
               ))
            ) : (
               <p className="p-6 text-sm text-muted-foreground">No saved views yet.</p>
            )}
         </div>
      </section>
   );
}
