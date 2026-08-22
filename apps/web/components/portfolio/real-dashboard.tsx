'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type Issue = { id: string; status: { category: string }; title: string; identifier: string };
type Project = { id: string; name: string; identifier: string; status: string; type: string };
type Team = { id: string; name: string };

export function RealDashboard() {
   const { orgId } = useParams<{ orgId: string }>();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   const [issues, setIssues] = useState<Issue[]>([]);
   const [projects, setProjects] = useState<Project[]>([]);
   const [teams, setTeams] = useState<Team[]>([]);
   const [error, setError] = useState<string>();

   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspaceId = (
         (await workspaceResponse.json()) as { data: Array<{ workspace: { id: string } }> }
      ).data[0]?.workspace.id;
      if (!workspaceId) throw new Error('No workspace is available.');
      const [issueResponse, projectResponse, teamResponse] = await Promise.all([
         fetch(`${api}/issues?workspaceId=${workspaceId}`, { credentials: 'include' }),
         fetch(`${api}/projects?workspaceId=${workspaceId}`, { credentials: 'include' }),
         fetch(`${api}/teams?workspaceId=${workspaceId}`, { credentials: 'include' }),
      ]);
      if (!issueResponse.ok || !projectResponse.ok || !teamResponse.ok)
         throw new Error('Could not load workspace data.');
      const [issuePayload, projectPayload, teamPayload] = (await Promise.all([
         issueResponse.json(),
         projectResponse.json(),
         teamResponse.json(),
      ])) as [{ data: Issue[] }, { data: Project[] }, { data: Team[] }];
      setIssues(issuePayload.data);
      setProjects(projectPayload.data);
      setTeams(teamPayload.data);
   }, [api]);

   useEffect(() => {
      void load().catch(() => setError('Could not load the workspace dashboard.'));
   }, [load]);

   const summary = useMemo(
      () => ({
         active: issues.filter((issue) =>
            ['STARTED', 'UNSTARTED', 'BACKLOG'].includes(issue.status.category)
         ).length,
         completed: issues.filter((issue) => issue.status.category === 'COMPLETED').length,
         projects: projects.filter(
            (project) => project.status !== 'completed' && project.status !== 'canceled'
         ).length,
      }),
      [issues, projects]
   );

   return (
      <section className="mx-auto w-full max-w-6xl p-6">
         <h1 className="text-xl font-semibold">Workspace dashboard</h1>
         <p className="mt-1 text-sm text-muted-foreground">
            A live snapshot of work in your teams.
         </p>
         {error ? (
            <p className="mt-5 text-sm text-destructive">{error}</p>
         ) : (
            <>
               <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                     ['Active issues', summary.active, `/${orgId}/views`],
                     ['Completed issues', summary.completed, `/${orgId}/views`],
                     ['Open projects', summary.projects, `/${orgId}/projects`],
                     ['Teams', teams.length, `/${orgId}/teams`],
                  ].map(([label, value, href]) => (
                     <Link
                        className="rounded-lg border p-4 transition-colors hover:bg-muted/50"
                        href={href as string}
                        key={label as string}
                     >
                        <p className="text-sm text-muted-foreground">{label}</p>
                        <p className="mt-2 text-2xl font-semibold">{value}</p>
                     </Link>
                  ))}
               </div>
               <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  <div className="overflow-hidden rounded-lg border">
                     <div className="border-b px-4 py-3 text-sm font-medium">
                        Recently updated issues
                     </div>
                     {issues.slice(0, 6).map((issue) => (
                        <Link
                           className="block border-b px-4 py-3 text-sm last:border-0 hover:bg-muted/50"
                           href={`/${orgId}/issue/${issue.id}`}
                           key={issue.id}
                        >
                           <span className="font-medium">{issue.identifier}</span> · {issue.title}
                        </Link>
                     ))}
                     {!issues.length && (
                        <p className="p-4 text-sm text-muted-foreground">No issues yet.</p>
                     )}
                  </div>
                  <div className="overflow-hidden rounded-lg border">
                     <div className="border-b px-4 py-3 text-sm font-medium">Projects</div>
                     {projects.slice(0, 6).map((project) => (
                        <Link
                           className="block border-b px-4 py-3 text-sm last:border-0 hover:bg-muted/50"
                           href={`/${orgId}/project/${project.id}/overview`}
                           key={project.id}
                        >
                           <span className="font-medium">{project.identifier}</span> ·{' '}
                           {project.name}
                           <span className="float-right text-xs text-muted-foreground">
                              {project.type}
                           </span>
                        </Link>
                     ))}
                     {!projects.length && (
                        <p className="p-4 text-sm text-muted-foreground">No projects yet.</p>
                     )}
                  </div>
               </div>
            </>
         )}
      </section>
   );
}
