'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
type Project = {
   id: string;
   identifier: string;
   name: string;
   status: string;
   priority: string;
   health: string;
   team: { name: string } | null;
};
export function RealProjects({ teamId }: { teamId?: string }) {
   const { orgId } = useParams<{ orgId: string }>();
   const [projects, setProjects] = useState<Project[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   useEffect(() => {
      const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
      void fetch(`${api}/workspaces/me`, { credentials: 'include' })
         .then((r) => (r.ok ? r.json() : Promise.reject()))
         .then((w: { data: Array<{ workspace: { id: string } }> }) =>
            fetch(
               `${api}/projects?${new URLSearchParams({ workspaceId: w.data[0]?.workspace.id ?? '', ...(teamId ? { teamId } : {}) })}`,
               {
                  credentials: 'include',
               }
            )
         )
         .then((r) => (r.ok ? r.json() : Promise.reject()))
         .then((p: { data: Project[] }) => {
            setProjects(p.data);
            setState('ready');
         })
         .catch(() => setState('error'));
   }, [teamId]);
   if (state === 'loading')
      return <p className="p-6 text-sm text-muted-foreground">Loading projects…</p>;
   if (state === 'error')
      return <p className="p-6 text-sm text-destructive">Could not load projects.</p>;
   if (!projects.length)
      return (
         <p className="p-6 text-sm text-muted-foreground">
            No projects yet. Create a project to get started.
         </p>
      );
   return (
      <div className="divide-y">
         {projects.map((project) => (
            <Link
               href={`/${orgId}/project/${project.id}/overview`}
               key={project.id}
               className="flex items-center gap-4 px-6 py-3"
            >
               <div className="min-w-0 flex-1">
                  <p className="font-medium">{project.name}</p>
                  <p className="text-xs text-muted-foreground">
                     {project.identifier}
                     {project.team ? ` · ${project.team.name}` : ''}
                  </p>
               </div>
               <span className="rounded bg-muted px-2 py-1 text-xs">{project.status}</span>
               <span className="text-xs text-muted-foreground">{project.priority}</span>
            </Link>
         ))}
      </div>
   );
}
