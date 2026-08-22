'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';

type Project = {
   id: string;
   name: string;
   identifier: string;
   description: string | null;
   status: string;
   priority: string;
   type: string;
   health: string;
   startDate: string | null;
   targetDate: string | null;
   team: { name: string; identifier: string } | null;
   _count: { issues: number };
};
type Issue = {
   id: string;
   identifier: string;
   title: string;
   status: { name: string; color: string };
   assignee: { name: string } | null;
};
type Activity = { id: string; type: string; createdAt: string; actor: { name: string } | null };
type Milestone = {
   id: string;
   title: string;
   targetDate: string | null;
   completedAt: string | null;
};

const time = (value: string) =>
   new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value)
   );

export function RealProjectDetail({
   projectId,
   orgId,
   view,
}: {
   projectId: string;
   orgId: string;
   view: 'overview' | 'issues' | 'activity';
}) {
   const [project, setProject] = useState<Project>();
   const [issues, setIssues] = useState<Issue[]>([]);
   const [activities, setActivities] = useState<Activity[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [milestones, setMilestones] = useState<Milestone[]>([]);
   const [milestoneTitle, setMilestoneTitle] = useState('');
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [editing, setEditing] = useState(false);
   const [name, setName] = useState('');
   const [description, setDescription] = useState('');
   const [actionError, setActionError] = useState<string>();
   const router = useRouter();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

   useEffect(() => {
      const load = async () => {
         const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
         if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
         const workspace = (await workspaceResponse.json()) as {
            data: Array<{ workspace: { id: string } }>;
         };
         const workspaceId = workspace.data[0]?.workspace.id;
         if (!workspaceId) throw new Error('No workspace is available.');
         setWorkspaceId(workspaceId);
         const projectResponse = await fetch(
            `${api}/projects/${projectId}?workspaceId=${workspaceId}`,
            { credentials: 'include' }
         );
         if (!projectResponse.ok) throw new Error('Could not load project.');
         setProject(((await projectResponse.json()) as { data: Project }).data);
         if (view === 'issues') {
            const response = await fetch(
               `${api}/projects/${projectId}/issues?workspaceId=${workspaceId}`,
               { credentials: 'include' }
            );
            if (!response.ok) throw new Error('Could not load project issues.');
            setIssues(((await response.json()) as { data: Issue[] }).data);
         }
         if (view === 'activity') {
            const response = await fetch(
               `${api}/activities?${new URLSearchParams({ workspaceId, projectId })}`,
               { credentials: 'include' }
            );
            if (!response.ok) throw new Error('Could not load project activity.');
            setActivities(((await response.json()) as { data: Activity[] }).data);
         }
         if (view === 'overview') {
            const response = await fetch(
               `${api}/projects/${projectId}/milestones?workspaceId=${workspaceId}`,
               {
                  credentials: 'include',
               }
            );
            if (!response.ok) throw new Error('Could not load project milestones.');
            setMilestones(((await response.json()) as { data: Milestone[] }).data);
         }
      };
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [api, projectId, view]);

   if (state === 'loading')
      return <p className="p-6 text-sm text-muted-foreground">Loading project…</p>;
   if (state === 'error' || !project)
      return <p className="p-6 text-sm text-destructive">Could not load this project.</p>;

   const href = (next: 'overview' | 'issues' | 'activity') =>
      `/${orgId}/project/${projectId}/${next}`;

   const save = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || name.trim().length < 2) return;
      setActionError(undefined);
      const response = await fetch(`${api}/projects/${projectId}?workspaceId=${workspaceId}`, {
         method: 'PATCH',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ name: name.trim(), description }),
      });
      if (!response.ok) {
         setActionError('Could not save project changes.');
         return;
      }
      setProject(((await response.json()) as { data: Project }).data);
      setEditing(false);
   };

   const archive = async () => {
      if (!workspaceId || !window.confirm('Archive this project and its active issues?')) return;
      setActionError(undefined);
      const response = await fetch(`${api}/projects/${projectId}?workspaceId=${workspaceId}`, {
         method: 'DELETE',
         credentials: 'include',
      });
      if (!response.ok) {
         setActionError('Could not archive this project.');
         return;
      }
      router.replace(`/${orgId}/projects`);
      router.refresh();
   };

   const createMilestone = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || milestoneTitle.trim().length < 2) return;
      const response = await fetch(`${api}/projects/${projectId}/milestones`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, title: milestoneTitle.trim() }),
      });
      if (!response.ok) {
         setActionError('Could not add this milestone.');
         return;
      }
      setMilestoneTitle('');
      const created = ((await response.json()) as { data: Milestone }).data;
      setMilestones((value) => [...value, created]);
   };

   const completeMilestone = async (milestone: Milestone) => {
      if (!workspaceId) return;
      const response = await fetch(
         `${api}/projects/${projectId}/milestones/${milestone.id}?workspaceId=${workspaceId}`,
         {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ completed: !milestone.completedAt }),
         }
      );
      if (!response.ok) {
         setActionError('Could not update this milestone.');
         return;
      }
      const updated = ((await response.json()) as { data: Milestone }).data;
      setMilestones((value) => value.map((item) => (item.id === updated.id ? updated : item)));
   };

   const deleteMilestone = async (milestone: Milestone) => {
      if (!workspaceId || !window.confirm('Delete this milestone?')) return;
      const response = await fetch(
         `${api}/projects/${projectId}/milestones/${milestone.id}?workspaceId=${workspaceId}`,
         { method: 'DELETE', credentials: 'include' }
      );
      if (!response.ok) {
         setActionError('Could not delete this milestone.');
         return;
      }
      setMilestones((value) => value.filter((item) => item.id !== milestone.id));
   };

   return (
      <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
         <div className="border-b pb-4">
            <p className="text-sm text-muted-foreground">
               {project.identifier}
               {project.team ? ` · ${project.team.name}` : ''}
            </p>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
               <h1 className="text-xl font-semibold">{project.name}</h1>
               {view === 'overview' && (
                  <div className="flex gap-2">
                     <button
                        className="rounded-md border px-2 py-1 text-xs"
                        onClick={() => {
                           setEditing(true);
                           setName(project.name);
                           setDescription(project.description ?? '');
                        }}
                        type="button"
                     >
                        Edit
                     </button>
                     <button
                        className="rounded-md border px-2 py-1 text-xs text-destructive"
                        onClick={() => void archive()}
                        type="button"
                     >
                        Archive
                     </button>
                  </div>
               )}
            </div>
            <nav className="mt-4 flex gap-4 text-sm">
               {(['overview', 'issues', 'activity'] as const).map((tab) => (
                  <Link
                     className={view === tab ? 'font-medium' : 'text-muted-foreground'}
                     href={href(tab)}
                     key={tab}
                  >
                     {tab[0].toUpperCase() + tab.slice(1)}
                  </Link>
               ))}
            </nav>
         </div>
         {view === 'overview' && (
            <>
               <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
                  <div>
                     <h2 className="font-medium">Overview</h2>
                     {editing ? (
                        <form className="mt-3 space-y-2" onSubmit={save}>
                           <input
                              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                              onChange={(event) => setName(event.target.value)}
                              value={name}
                           />
                           <textarea
                              className="min-h-32 w-full resize-y rounded-md border bg-background px-3 py-2 text-sm"
                              onChange={(event) => setDescription(event.target.value)}
                              placeholder="Project description"
                              value={description}
                           />
                           <div className="flex justify-end gap-2">
                              <button
                                 className="rounded-md border px-3 py-1.5 text-xs"
                                 onClick={() => setEditing(false)}
                                 type="button"
                              >
                                 Cancel
                              </button>
                              <button
                                 className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground"
                                 type="submit"
                              >
                                 Save
                              </button>
                           </div>
                        </form>
                     ) : (
                        <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                           {project.description || 'No project description yet.'}
                        </p>
                     )}
                     {actionError && <p className="mt-2 text-xs text-destructive">{actionError}</p>}
                  </div>
                  <dl className="rounded-md border p-4 text-sm">
                     <div>
                        <dt className="text-xs text-muted-foreground">Status</dt>
                        <dd className="mt-1">{project.status}</dd>
                     </div>
                     <div className="mt-4">
                        <dt className="text-xs text-muted-foreground">Priority</dt>
                        <dd className="mt-1">{project.priority}</dd>
                     </div>
                     <div className="mt-4">
                        <dt className="text-xs text-muted-foreground">Project type</dt>
                        <dd className="mt-1">{project.type.toLowerCase()}</dd>
                     </div>
                     <div className="mt-4">
                        <dt className="text-xs text-muted-foreground">Issues</dt>
                        <dd className="mt-1">{project._count.issues}</dd>
                     </div>
                     <div className="mt-4">
                        <dt className="text-xs text-muted-foreground">Target date</dt>
                        <dd className="mt-1">
                           {project.targetDate ? time(project.targetDate) : 'Not set'}
                        </dd>
                     </div>
                  </dl>
               </div>
               <div className="mt-8 rounded-md border p-4">
                  <div className="flex items-center justify-between gap-3">
                     <h2 className="font-medium">Milestones</h2>
                     <span className="text-xs text-muted-foreground">
                        {milestones.filter((milestone) => milestone.completedAt).length}/
                        {milestones.length} complete
                     </span>
                  </div>
                  <form className="mt-3 flex gap-2" onSubmit={createMilestone}>
                     <input
                        className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
                        onChange={(event) => setMilestoneTitle(event.target.value)}
                        placeholder="Add a milestone"
                        value={milestoneTitle}
                     />
                     <button
                        className="rounded-md border px-3 py-2 text-sm"
                        disabled={milestoneTitle.trim().length < 2}
                        type="submit"
                     >
                        Add
                     </button>
                  </form>
                  {milestones.length ? (
                     <ul className="mt-3 divide-y">
                        {milestones.map((milestone) => (
                           <li className="flex items-center gap-3 py-2 text-sm" key={milestone.id}>
                              <input
                                 aria-label={`Complete ${milestone.title}`}
                                 checked={Boolean(milestone.completedAt)}
                                 onChange={() => void completeMilestone(milestone)}
                                 type="checkbox"
                              />
                              <span
                                 className={
                                    milestone.completedAt
                                       ? 'min-w-0 flex-1 line-through text-muted-foreground'
                                       : 'min-w-0 flex-1'
                                 }
                              >
                                 {milestone.title}
                              </span>
                              {milestone.targetDate && (
                                 <span className="text-xs text-muted-foreground">
                                    {time(milestone.targetDate)}
                                 </span>
                              )}
                              <button
                                 className="text-xs text-destructive"
                                 onClick={() => void deleteMilestone(milestone)}
                                 type="button"
                              >
                                 Delete
                              </button>
                           </li>
                        ))}
                     </ul>
                  ) : (
                     <p className="mt-3 text-sm text-muted-foreground">No milestones yet.</p>
                  )}
               </div>
            </>
         )}
         {view === 'issues' && (
            <div className="mt-6 overflow-hidden rounded-md border">
               {issues.length ? (
                  issues.map((issue) => (
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
                        <span className="text-xs text-muted-foreground">{issue.identifier}</span>
                     </Link>
                  ))
               ) : (
                  <p className="p-6 text-sm text-muted-foreground">
                     No issues in this project yet.
                  </p>
               )}
            </div>
         )}
         {view === 'activity' && (
            <div className="mt-6">
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
         )}
      </section>
   );
}
