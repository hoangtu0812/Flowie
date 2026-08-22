'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Project = {
   id: string;
   name: string;
   identifier: string;
   description: string | null;
   status: string;
   priority: string;
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
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
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
   return (
      <section className="mx-auto w-full max-w-5xl p-4 sm:p-6">
         <div className="border-b pb-4">
            <p className="text-sm text-muted-foreground">
               {project.identifier}
               {project.team ? ` · ${project.team.name}` : ''}
            </p>
            <h1 className="mt-1 text-xl font-semibold">{project.name}</h1>
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
            <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
               <div>
                  <h2 className="font-medium">Overview</h2>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                     {project.description || 'No project description yet.'}
                  </p>
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
