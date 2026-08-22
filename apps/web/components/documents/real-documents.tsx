'use client';

import { FormEvent, useEffect, useState } from 'react';

type Document = {
   id: string;
   title: string;
   content: string;
   updatedAt: string;
   createdBy: { name: string; avatarUrl: string | null };
   updatedBy: { name: string; avatarUrl: string | null };
};

function relativeDate(value: string) {
   const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
   if (seconds < 60) return 'just now';
   if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
   if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
   return `${Math.floor(seconds / 86400)}d ago`;
}

export function RealDocuments({ teamId }: { teamId: string }) {
   const [documents, setDocuments] = useState<Document[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [creating, setCreating] = useState(false);
   const [title, setTitle] = useState('');
   const [createError, setCreateError] = useState<string>();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

   const loadDocuments = async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspace = (await workspaceResponse.json()) as {
         data: Array<{ workspace: { id: string } }>;
      };
      const currentWorkspaceId = workspace.data[0]?.workspace.id;
      if (!currentWorkspaceId) throw new Error('No workspace is available.');
      setWorkspaceId(currentWorkspaceId);
      const response = await fetch(
         `${api}/documents?${new URLSearchParams({ workspaceId: currentWorkspaceId, teamId })}`,
         { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Could not load documents.');
      setDocuments(((await response.json()) as { data: Document[] }).data);
   };

   useEffect(() => {
      void loadDocuments()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
      // Team id changes represent a different document collection.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [teamId]);

   const createDocument = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || title.trim().length < 2) return;
      setCreateError(undefined);
      const response = await fetch(`${api}/documents`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, teamId, title: title.trim() }),
      });
      if (!response.ok) {
         setCreateError('Could not create the document.');
         return;
      }
      setTitle('');
      setCreating(false);
      await loadDocuments();
   };

   if (state === 'loading')
      return <p className="p-6 text-sm text-muted-foreground">Loading documents…</p>;
   if (state === 'error')
      return (
         <p className="p-6 text-sm text-destructive">Could not load documents for this team.</p>
      );

   return (
      <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
         <div className="mb-4 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">{documents.length} documents</p>
            <button
               className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
               onClick={() => setCreating((value) => !value)}
               type="button"
            >
               New document
            </button>
         </div>
         {creating && (
            <form className="mb-4 rounded-md border bg-card p-3" onSubmit={createDocument}>
               <label className="sr-only" htmlFor="document-title">
                  Document title
               </label>
               <div className="flex gap-2">
                  <input
                     autoFocus
                     className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                     id="document-title"
                     onChange={(event) => setTitle(event.target.value)}
                     placeholder="Document title"
                     value={title}
                  />
                  <button
                     className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                     disabled={title.trim().length < 2}
                     type="submit"
                  >
                     Create
                  </button>
               </div>
               {createError && <p className="mt-2 text-xs text-destructive">{createError}</p>}
            </form>
         )}
         {!documents.length ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
               No documents in this team yet.
            </div>
         ) : (
            <div className="overflow-hidden rounded-md border">
               {documents.map((document) => (
                  <article
                     className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
                     key={document.id}
                  >
                     <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{document.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                           Updated {relativeDate(document.updatedAt)} by {document.updatedBy.name}
                        </p>
                     </div>
                     <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-xs font-medium">
                        {document.updatedBy.name.slice(0, 1).toUpperCase()}
                     </span>
                  </article>
               ))}
            </div>
         )}
      </section>
   );
}
