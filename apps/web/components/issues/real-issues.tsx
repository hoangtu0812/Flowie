'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

type Issue = {
   id: string;
   identifier: string;
   title: string;
   priority: string;
   status: { name: string; category: string; color: string };
   project: { name: string; identifier: string } | null;
   assignee: { name: string } | null;
};

type WorkspaceResponse = { data: Array<{ workspace: { id: string } }> };

export function RealIssues({ teamId, categories }: { teamId: string; categories?: string[] }) {
   const { orgId } = useParams<{ orgId: string }>();
   const [issues, setIssues] = useState<Issue[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [creating, setCreating] = useState(false);
   const [title, setTitle] = useState('');
   const [createError, setCreateError] = useState<string>();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

   const loadIssues = async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspaceData = (await workspaceResponse.json()) as WorkspaceResponse;
      const currentWorkspaceId = workspaceData.data[0]?.workspace.id;
      if (!currentWorkspaceId) throw new Error('No workspace is available.');
      setWorkspaceId(currentWorkspaceId);
      const query = new URLSearchParams({ workspaceId: currentWorkspaceId, teamId });
      if (categories?.length) query.set('categories', categories.join(','));
      const issueResponse = await fetch(`${api}/issues?${query.toString()}`, {
         credentials: 'include',
      });
      if (!issueResponse.ok) throw new Error('Could not load issues.');
      const issueData = (await issueResponse.json()) as { data: Issue[] };
      setIssues(issueData.data);
   };

   useEffect(() => {
      void loadIssues()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
      // The route parameters identify a distinct issue view.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [teamId, categories?.join(',')]);

   const createIssue = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || title.trim().length < 2) return;
      setCreateError(undefined);
      const response = await fetch(`${api}/issues`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, teamId, title: title.trim() }),
      });
      if (!response.ok) {
         setCreateError('Could not create the issue.');
         return;
      }
      setTitle('');
      setCreating(false);
      await loadIssues();
   };

   if (state === 'loading') {
      return <p className="p-6 text-sm text-muted-foreground">Loading issues…</p>;
   }
   if (state === 'error') {
      return (
         <div className="space-y-3 p-6 text-sm">
            <p className="text-destructive">
               Không thể tải issues của team này. Team có thể không tồn tại hoặc bạn không còn quyền
               truy cập.
            </p>
            <Link className="font-medium text-primary underline" href={`/${orgId}/teams`}>
               Quay về danh sách team
            </Link>
         </div>
      );
   }

   return (
      <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
         <div className="mb-4 flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">{issues.length} issues</p>
            <button
               className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
               onClick={() => setCreating((value) => !value)}
               type="button"
            >
               New issue
            </button>
         </div>
         {creating && (
            <form className="mb-4 rounded-md border bg-card p-3" onSubmit={createIssue}>
               <label className="sr-only" htmlFor="issue-title">
                  Issue title
               </label>
               <div className="flex gap-2">
                  <input
                     autoFocus
                     className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                     id="issue-title"
                     onChange={(event) => setTitle(event.target.value)}
                     placeholder="What needs to be done?"
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
         {!issues.length ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
               No issues in this view yet.
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
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: issue.status.color }}
                     />
                     <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{issue.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                           {issue.identifier} · {issue.status.name}
                           {issue.project ? ` · ${issue.project.identifier}` : ''}
                           {issue.assignee ? ` · ${issue.assignee.name}` : ''}
                        </p>
                     </div>
                     {issue.priority !== 'NONE' && (
                        <span className="text-xs text-muted-foreground">
                           {issue.priority.toLowerCase()}
                        </span>
                     )}
                  </Link>
               ))}
            </div>
         )}
      </section>
   );
}
