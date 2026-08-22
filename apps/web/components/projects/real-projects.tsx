'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Plus } from 'lucide-react';

type Project = {
   id: string;
   identifier: string;
   name: string;
   status: string;
   priority: string;
   team: { name: string } | null;
};
type Team = { id: string; name: string; identifier: string };
type WorkspaceResponse = { data: Array<{ workspace: { id: string } }> };

export function RealProjects({ teamId }: { teamId?: string }) {
   const { orgId } = useParams<{ orgId: string }>();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   const [projects, setProjects] = useState<Project[]>([]);
   const [teams, setTeams] = useState<Team[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [creating, setCreating] = useState(false);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const [name, setName] = useState('');
   const [identifier, setIdentifier] = useState('');
   const [selectedTeamId, setSelectedTeamId] = useState(teamId ?? '');

   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspaces = (await workspaceResponse.json()) as WorkspaceResponse;
      const currentWorkspaceId = workspaces.data[0]?.workspace.id;
      if (!currentWorkspaceId) throw new Error('No workspace is available.');
      setWorkspaceId(currentWorkspaceId);
      const [projectResponse, teamsResponse] = await Promise.all([
         fetch(
            `${api}/projects?${new URLSearchParams({
               workspaceId: currentWorkspaceId,
               ...(teamId ? { teamId } : {}),
            })}`,
            { credentials: 'include' }
         ),
         fetch(`${api}/teams?workspaceId=${currentWorkspaceId}`, { credentials: 'include' }),
      ]);
      if (!projectResponse.ok || !teamsResponse.ok) throw new Error('Could not load projects.');
      const [projectPayload, teamsPayload] = (await Promise.all([
         projectResponse.json(),
         teamsResponse.json(),
      ])) as [{ data: Project[] }, { data: Team[] }];
      setProjects(projectPayload.data);
      setTeams(teamsPayload.data);
   }, [api, teamId]);

   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);

   async function createProject(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!workspaceId || name.trim().length < 2 || identifier.trim().length < 2) return;
      setSaving(true);
      setError(undefined);
      try {
         const response = await fetch(`${api}/projects`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId,
               name: name.trim(),
               identifier: identifier.trim().toUpperCase(),
               ...(selectedTeamId ? { teamId: selectedTeamId } : {}),
            }),
         });
         const payload = (await response.json()) as { message?: string | string[] };
         if (!response.ok) {
            throw new Error(
               Array.isArray(payload.message)
                  ? payload.message[0]
                  : (payload.message ?? 'Không thể tạo dự án.')
            );
         }
         setName('');
         setIdentifier('');
         setCreating(false);
         await load();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Không thể tạo dự án.');
      } finally {
         setSaving(false);
      }
   }

   if (state === 'loading')
      return <p className="p-6 text-sm text-muted-foreground">Đang tải dự án…</p>;
   if (state === 'error')
      return <p className="p-6 text-sm text-destructive">Không thể tải dự án.</p>;

   return (
      <section>
         <div className="flex items-center justify-between gap-4 border-b px-6 py-3">
            <p className="text-sm text-muted-foreground">{projects.length} dự án</p>
            <button
               className="inline-flex items-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
               onClick={() => setCreating((value) => !value)}
               type="button"
            >
               <Plus className="mr-1.5 size-4" /> Tạo dự án
            </button>
         </div>
         {creating && (
            <form
               className="m-6 max-w-xl space-y-4 rounded-lg border bg-card p-4"
               onSubmit={createProject}
            >
               <div>
                  <label className="text-sm font-medium" htmlFor="project-name">
                     Tên dự án
                  </label>
                  <input
                     id="project-name"
                     className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                     value={name}
                     onChange={(event) => setName(event.target.value)}
                     required
                     minLength={2}
                     maxLength={120}
                     autoFocus
                  />
               </div>
               <div>
                  <label className="text-sm font-medium" htmlFor="project-identifier">
                     Mã dự án
                  </label>
                  <input
                     id="project-identifier"
                     className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm uppercase"
                     value={identifier}
                     onChange={(event) => setIdentifier(event.target.value.toUpperCase())}
                     required
                     minLength={2}
                     maxLength={24}
                     placeholder="FLOW"
                  />
               </div>
               <div>
                  <label className="text-sm font-medium" htmlFor="project-team">
                     Team
                  </label>
                  <select
                     id="project-team"
                     className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                     value={selectedTeamId}
                     onChange={(event) => setSelectedTeamId(event.target.value)}
                     disabled={Boolean(teamId)}
                  >
                     {!teamId && <option value="">Không gán team</option>}
                     {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                           {team.name} ({team.identifier})
                        </option>
                     ))}
                  </select>
               </div>
               {error && <p className="text-sm text-destructive">{error}</p>}
               <div className="flex justify-end gap-2">
                  <button
                     className="rounded-md border px-3 py-2 text-sm font-medium"
                     onClick={() => setCreating(false)}
                     type="button"
                  >
                     Hủy
                  </button>
                  <button
                     className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                     disabled={saving || name.trim().length < 2 || identifier.trim().length < 2}
                     type="submit"
                  >
                     {saving ? 'Đang tạo…' : 'Tạo dự án'}
                  </button>
               </div>
            </form>
         )}
         {!projects.length ? (
            <p className="p-6 text-sm text-muted-foreground">
               Chưa có dự án nào. Bấm “Tạo dự án” để bắt đầu.
            </p>
         ) : (
            <div className="divide-y">
               {projects.map((project) => (
                  <Link
                     href={`/${orgId}/project/${project.id}/overview`}
                     key={project.id}
                     className="flex items-center gap-4 px-6 py-3 transition-colors hover:bg-muted/50"
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
         )}
      </section>
   );
}
