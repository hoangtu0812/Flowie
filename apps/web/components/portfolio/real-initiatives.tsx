'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

type Initiative = {
   id: string;
   name: string;
   description: string | null;
   status: string;
   targetDate: string | null;
   _count: { projectLinks: number };
   projectLinks: Array<{
      project: { id: string; name: string; identifier: string; status: string };
   }>;
};

export function RealInitiatives() {
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [initiatives, setInitiatives] = useState<Initiative[]>([]);
   const [name, setName] = useState('');
   const [error, setError] = useState<string>();

   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspaceId = (
         (await workspaceResponse.json()) as { data: Array<{ workspace: { id: string } }> }
      ).data[0]?.workspace.id;
      if (!workspaceId) throw new Error('No workspace is available.');
      setWorkspaceId(workspaceId);
      const response = await fetch(`${api}/initiatives?workspaceId=${workspaceId}`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not load initiatives.');
      setInitiatives(((await response.json()) as { data: Initiative[] }).data);
   }, [api]);
   useEffect(() => {
      void load().catch(() => setError('Could not load initiatives.'));
   }, [load]);

   const create = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || name.trim().length < 2) return;
      const response = await fetch(`${api}/initiatives`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, name: name.trim() }),
      });
      if (!response.ok) {
         setError('Could not create initiative. Workspace administrator permission is required.');
         return;
      }
      setName('');
      await load();
   };

   const archive = async (initiative: Initiative) => {
      if (!workspaceId || !window.confirm(`Archive initiative “${initiative.name}”?`)) return;
      const response = await fetch(
         `${api}/initiatives/${initiative.id}?workspaceId=${workspaceId}`,
         { method: 'DELETE', credentials: 'include' }
      );
      if (!response.ok) {
         setError('Could not archive initiative.');
         return;
      }
      await load();
   };

   return (
      <section className="mx-auto w-full max-w-5xl p-6">
         <div>
            <h1 className="text-xl font-semibold">Initiatives</h1>
            <p className="mt-1 text-sm text-muted-foreground">
               Group multiple projects under strategic outcomes.
            </p>
         </div>
         <form className="mt-6 flex gap-2 rounded-lg border p-3" onSubmit={create}>
            <input
               className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
               onChange={(event) => setName(event.target.value)}
               placeholder="Initiative name"
               value={name}
            />
            <button
               className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
               disabled={name.trim().length < 2}
               type="submit"
            >
               Create
            </button>
         </form>
         {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
         <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {initiatives.map((initiative) => (
               <article className="rounded-lg border p-4" key={initiative.id}>
                  <div className="flex gap-3">
                     <div className="min-w-0 flex-1">
                        <p className="font-medium">{initiative.name}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                           {initiative.description || 'No description yet.'}
                        </p>
                     </div>
                     <button
                        className="text-xs text-destructive"
                        onClick={() => void archive(initiative)}
                        type="button"
                     >
                        Archive
                     </button>
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                     <span>{initiative.status}</span>
                     <span>{initiative._count.projectLinks} projects</span>
                  </div>
                  {initiative.projectLinks.length > 0 && (
                     <ul className="mt-3 space-y-1 text-xs">
                        {initiative.projectLinks.map(({ project }) => (
                           <li key={project.id}>
                              {project.identifier} · {project.name}
                           </li>
                        ))}
                     </ul>
                  )}
               </article>
            ))}
            {!initiatives.length && (
               <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground sm:col-span-2">
                  No initiatives yet.
               </p>
            )}
         </div>
      </section>
   );
}
