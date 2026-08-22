'use client';

import { FormEvent, useEffect, useState } from 'react';

type Issue = {
   id: string;
   identifier: string;
   title: string;
   description: string | null;
   priority: string;
   status: { name: string; color: string };
   team: { name: string; identifier: string };
   project: { name: string; identifier: string } | null;
   creator: { name: string };
   assignee: { name: string } | null;
};
type Comment = { id: string; content: string; createdAt: string; author: { name: string } };
type Activity = { id: string; type: string; createdAt: string; actor: { name: string } | null };

function time(value: string) {
   return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value)
   );
}

export function RealIssueDetail({ issueId }: { issueId: string }) {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [issue, setIssue] = useState<Issue>();
   const [comments, setComments] = useState<Comment[]>([]);
   const [activities, setActivities] = useState<Activity[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [content, setContent] = useState('');
   const [commentError, setCommentError] = useState<string>();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

   const load = async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspace = (await workspaceResponse.json()) as {
         data: Array<{ workspace: { id: string } }>;
      };
      const currentWorkspaceId = workspace.data[0]?.workspace.id;
      if (!currentWorkspaceId) throw new Error('No workspace is available.');
      setWorkspaceId(currentWorkspaceId);
      const query = new URLSearchParams({ workspaceId: currentWorkspaceId, issueId });
      const [issueResponse, commentsResponse, activitiesResponse] = await Promise.all([
         fetch(`${api}/issues/${issueId}?workspaceId=${currentWorkspaceId}`, {
            credentials: 'include',
         }),
         fetch(`${api}/comments?${query}`, { credentials: 'include' }),
         fetch(`${api}/activities?${query}`, { credentials: 'include' }),
      ]);
      if (!issueResponse.ok || !commentsResponse.ok || !activitiesResponse.ok)
         throw new Error('Could not load issue.');
      setIssue(((await issueResponse.json()) as { data: Issue }).data);
      setComments(((await commentsResponse.json()) as { data: Comment[] }).data);
      setActivities(((await activitiesResponse.json()) as { data: Activity[] }).data);
   };

   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
      // The issue id identifies a distinct detail view.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [issueId]);

   const addComment = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !content.trim()) return;
      setCommentError(undefined);
      const response = await fetch(`${api}/comments`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, issueId, content: content.trim() }),
      });
      if (!response.ok) {
         setCommentError('Could not add the comment.');
         return;
      }
      setContent('');
      await load();
   };

   if (state === 'loading')
      return <p className="p-6 text-sm text-muted-foreground">Loading issue…</p>;
   if (state === 'error' || !issue)
      return <p className="p-6 text-sm text-destructive">Could not load this issue.</p>;

   return (
      <section className="mx-auto grid w-full max-w-5xl gap-6 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_240px]">
         <div>
            <p className="mb-2 text-sm text-muted-foreground">
               {issue.identifier} · {issue.team.name}
            </p>
            <h1 className="text-xl font-semibold">{issue.title}</h1>
            {issue.description && (
               <p className="mt-4 whitespace-pre-wrap text-sm text-muted-foreground">
                  {issue.description}
               </p>
            )}
            <div className="mt-8">
               <h2 className="mb-3 font-medium">Activity</h2>
               {activities.length ? (
                  <ol className="space-y-3 border-l pl-4">
                     {activities.map((activity) => (
                        <li className="text-sm" key={activity.id}>
                           <span className="font-medium">{activity.actor?.name ?? 'System'}</span>{' '}
                           {activity.type.replace('.', ' ')}
                           <p className="mt-0.5 text-xs text-muted-foreground">
                              {time(activity.createdAt)}
                           </p>
                        </li>
                     ))}
                  </ol>
               ) : (
                  <p className="text-sm text-muted-foreground">No activity yet.</p>
               )}
            </div>
            <div className="mt-8">
               <h2 className="mb-3 font-medium">Comments</h2>
               <div className="space-y-4">
                  {comments.map((comment) => (
                     <article className="rounded-md border p-3" key={comment.id}>
                        <p className="text-sm font-medium">{comment.author.name}</p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{comment.content}</p>
                        <p className="mt-2 text-xs text-muted-foreground">
                           {time(comment.createdAt)}
                        </p>
                     </article>
                  ))}
               </div>
               <form className="mt-4 rounded-md border p-3" onSubmit={addComment}>
                  <label className="sr-only" htmlFor="comment">
                     Add comment
                  </label>
                  <textarea
                     className="min-h-24 w-full resize-y rounded-md border bg-background p-2 text-sm"
                     id="comment"
                     onChange={(event) => setContent(event.target.value)}
                     placeholder="Write a comment…"
                     value={content}
                  />
                  <div className="mt-2 flex items-center justify-between gap-3">
                     {commentError ? (
                        <p className="text-xs text-destructive">{commentError}</p>
                     ) : (
                        <span />
                     )}
                     <button
                        className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                        disabled={!content.trim()}
                        type="submit"
                     >
                        Comment
                     </button>
                  </div>
               </form>
            </div>
         </div>
         <aside className="rounded-md border p-4 text-sm">
            <dl className="space-y-4">
               <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd className="mt-1 flex items-center gap-2">
                     <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: issue.status.color }}
                     />
                     {issue.status.name}
                  </dd>
               </div>
               <div>
                  <dt className="text-xs text-muted-foreground">Priority</dt>
                  <dd className="mt-1">{issue.priority.toLowerCase()}</dd>
               </div>
               <div>
                  <dt className="text-xs text-muted-foreground">Assignee</dt>
                  <dd className="mt-1">{issue.assignee?.name ?? 'Unassigned'}</dd>
               </div>
               <div>
                  <dt className="text-xs text-muted-foreground">Project</dt>
                  <dd className="mt-1">{issue.project?.name ?? 'None'}</dd>
               </div>
               <div>
                  <dt className="text-xs text-muted-foreground">Created by</dt>
                  <dd className="mt-1">{issue.creator.name}</dd>
               </div>
            </dl>
         </aside>
      </section>
   );
}
