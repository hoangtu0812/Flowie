'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
   CircleAlert,
   CircleCheck,
   CircleDashed,
   FolderKanban,
   ListFilter,
   Plus,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';

type Project = {
   id: string;
   identifier: string;
   name: string;
   status: string;
   priority: string;
   health: string;
   type: string;
   targetDate: string | null;
   team: { id: string; name: string; identifier: string; icon: string | null } | null;
   _count: { issues: number };
};
type Team = { id: string; name: string; identifier: string; icon: string | null };
type WorkspaceResponse = { data: Array<{ workspace: { id: string } }> };
type View = 'all' | 'active';
type ProjectGroup = { id: string; name: string; icon?: string | null; projects: Project[] };

const HEALTH: Record<string, { label: string; className: string; Icon: typeof CircleCheck }> = {
   'on-track': { label: 'On track', className: 'text-emerald-500', Icon: CircleCheck },
   'at-risk': { label: 'At risk', className: 'text-amber-500', Icon: CircleAlert },
   'off-track': { label: 'Off track', className: 'text-red-500', Icon: CircleAlert },
   'no-update': { label: 'No update', className: 'text-muted-foreground', Icon: CircleDashed },
};
const ACTIVE_STATUSES = new Set(['planned', 'active', 'started', 'in-progress', 'in_progress']);
const PROJECT_TYPES = [
   'GENERAL',
   'PRODUCT',
   'MARKETING',
   'OPERATIONS',
   'EVENT',
   'CLIENT',
   'RESEARCH',
   'CUSTOM',
];

const healthOf = (value: string) => HEALTH[value.toLowerCase()] ?? HEALTH['no-update'];
const dateLabel = (value: string | null) =>
   value
      ? new Intl.DateTimeFormat(undefined, {
           month: 'short',
           day: 'numeric',
           year: 'numeric',
        }).format(new Date(value))
      : 'No date';

export function RealProjects({ teamId }: { teamId?: string }) {
   const { orgId } = useParams<{ orgId: string }>();
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   const [projects, setProjects] = useState<Project[]>([]);
   const [teams, setTeams] = useState<Team[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [view, setView] = useState<View>('all');
   const [healthFilter, setHealthFilter] = useState<string>('all');
   const [createOpen, setCreateOpen] = useState(false);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const [name, setName] = useState('');
   const [identifier, setIdentifier] = useState('');
   const [selectedTeamId, setSelectedTeamId] = useState(teamId ?? 'none');
   const [projectType, setProjectType] = useState('GENERAL');

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

   useEffect(() => {
      const open = () => setCreateOpen(true);
      window.addEventListener('flowie:create-project', open);
      return () => window.removeEventListener('flowie:create-project', open);
   }, []);

   const displayed = useMemo(
      () =>
         projects
            .filter(
               (project) => view === 'all' || ACTIVE_STATUSES.has(project.status.toLowerCase())
            )
            .filter((project) => healthFilter === 'all' || project.health === healthFilter)
            .sort((left, right) => left.name.localeCompare(right.name)),
      [healthFilter, projects, view]
   );

   const groups = useMemo<ProjectGroup[]>(() => {
      if (teamId) {
         return [
            {
               id: teamId,
               name: teams.find((team) => team.id === teamId)?.name ?? 'Projects',
               projects: displayed,
            },
         ];
      }
      const teamGroups = teams
         .map((team) => ({
            id: team.id,
            name: team.name,
            icon: team.icon,
            projects: displayed.filter((project) => project.team?.id === team.id),
         }))
         .filter((group) => group.projects.length > 0);
      const unassigned = displayed.filter((project) => !project.team);
      return unassigned.length
         ? [...teamGroups, { id: 'unassigned', name: 'Unassigned', projects: unassigned }]
         : teamGroups;
   }, [displayed, teamId, teams]);

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
               type: projectType,
               ...(selectedTeamId !== 'none' ? { teamId: selectedTeamId } : {}),
            }),
         });
         const payload = (await response.json()) as { message?: string | string[] };
         if (!response.ok) {
            throw new Error(
               Array.isArray(payload.message)
                  ? payload.message[0]
                  : (payload.message ?? 'Could not create project.')
            );
         }
         setName('');
         setIdentifier('');
         setProjectType('GENERAL');
         setCreateOpen(false);
         await load();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not create project.');
      } finally {
         setSaving(false);
      }
   }

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10 shrink-0">
            <div className="flex items-center gap-1">
               {(['all', 'active'] as const).map((item) => (
                  <button
                     key={item}
                     type="button"
                     onClick={() => setView(item)}
                     className={cn(
                        'px-2.5 h-7 inline-flex items-center rounded-full border text-xs font-medium transition-colors',
                        view === item
                           ? 'bg-accent text-foreground border-border'
                           : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
                     )}
                  >
                     {item === 'all' ? 'All projects' : 'Active projects'}
                  </button>
               ))}
            </div>
            <div className="flex items-center gap-1">
               <Select value={healthFilter} onValueChange={setHealthFilter}>
                  <SelectTrigger className="h-7 w-auto gap-1 border-0 px-2 text-xs shadow-none">
                     <ListFilter className="size-4" />
                     <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="all">All health</SelectItem>
                     {Object.entries(HEALTH).map(([value, health]) => (
                        <SelectItem key={value} value={value}>
                           {health.label}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
               <Button size="xs" variant="ghost" onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4" />
                  <span className="hidden sm:inline ml-1">Create project</span>
               </Button>
            </div>
         </div>

         <div className="flex-1 min-h-0 w-full overflow-y-auto">
            <div className="bg-container px-6 py-1.5 text-sm flex items-center text-muted-foreground border-b sticky top-0 z-10">
               <div className="flex-1 min-w-0">Name</div>
               <div className="hidden sm:block w-[120px] shrink-0 pl-2">Health</div>
               <div className="hidden md:block w-[90px] shrink-0 pl-2">Priority</div>
               <div className="hidden xl:block w-[130px] shrink-0 pl-2">Target date</div>
               <div className="hidden xl:block w-[60px] shrink-0 pl-2">Issues</div>
               <div className="w-[100px] shrink-0 pl-2">Status</div>
            </div>
            {state === 'loading' && (
               <p className="px-6 py-4 text-sm text-muted-foreground">Loading projects…</p>
            )}
            {state === 'error' && (
               <p className="px-6 py-4 text-sm text-destructive">Could not load projects.</p>
            )}
            {state === 'ready' && groups.length === 0 && (
               <p className="px-6 py-4 text-sm text-muted-foreground">
                  No projects match this view.
               </p>
            )}
            {groups.map((group) => (
               <section key={group.id}>
                  <div className="flex items-center gap-2 px-6 h-9 text-sm font-medium bg-[color-mix(in_oklab,var(--accent)_30%,var(--container))] border-b border-border/40 sticky top-8 z-[9]">
                     {group.icon && <span>{group.icon}</span>}
                     {group.name}
                     <span className="text-xs text-muted-foreground">{group.projects.length}</span>
                  </div>
                  {group.projects.map((project) => {
                     const health = healthOf(project.health);
                     return (
                        <Link
                           href={`/${orgId}/project/${project.id}/overview`}
                           key={project.id}
                           className="w-full flex items-center py-3 px-6 border-b hover:bg-sidebar/50 border-muted-foreground/5 text-sm"
                        >
                           <div className="flex-1 min-w-0 flex items-center gap-2">
                              <span className="inline-flex size-6 bg-muted/50 items-center justify-center rounded shrink-0">
                                 <FolderKanban className="size-4" />
                              </span>
                              <span className="font-medium truncate hover:underline underline-offset-2">
                                 {project.name}
                              </span>
                           </div>
                           <div className="hidden sm:flex w-[120px] shrink-0 items-center gap-1.5 text-xs">
                              <health.Icon className={cn('size-4', health.className)} />
                              <span className="hidden xl:inline">{health.label}</span>
                           </div>
                           <div className="hidden md:block w-[90px] shrink-0 text-xs text-muted-foreground capitalize">
                              {project.priority}
                           </div>
                           <div className="hidden xl:block w-[130px] shrink-0 text-xs text-muted-foreground">
                              {dateLabel(project.targetDate)}
                           </div>
                           <div className="hidden xl:block w-[60px] shrink-0 text-xs text-muted-foreground">
                              {project._count.issues}
                           </div>
                           <div className="w-[100px] shrink-0 text-xs font-medium capitalize">
                              {project.status}
                           </div>
                        </Link>
                     );
                  })}
               </section>
            ))}
         </div>

         <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="sm:max-w-[560px]">
               <DialogHeader>
                  <DialogTitle>Create project</DialogTitle>
               </DialogHeader>
               <form className="space-y-4" onSubmit={createProject}>
                  <div className="space-y-2">
                     <Label htmlFor="project-name">Name</Label>
                     <Input
                        id="project-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        minLength={2}
                        maxLength={120}
                        required
                        autoFocus
                     />
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="project-identifier">Identifier</Label>
                     <Input
                        id="project-identifier"
                        value={identifier}
                        onChange={(event) => setIdentifier(event.target.value.toUpperCase())}
                        minLength={2}
                        maxLength={24}
                        placeholder="FLOW"
                        required
                     />
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="project-type">Project type</Label>
                     <Select value={projectType} onValueChange={setProjectType}>
                        <SelectTrigger id="project-type">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {PROJECT_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                 {type}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="project-team">Team</Label>
                     <Select
                        value={selectedTeamId}
                        onValueChange={setSelectedTeamId}
                        disabled={Boolean(teamId)}
                     >
                        <SelectTrigger id="project-team">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {!teamId && <SelectItem value="none">No team</SelectItem>}
                           {teams.map((team) => (
                              <SelectItem key={team.id} value={team.id}>
                                 {team.name} ({team.identifier})
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <div className="flex justify-end gap-2">
                     <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                        Cancel
                     </Button>
                     <Button
                        type="submit"
                        disabled={saving || name.trim().length < 2 || identifier.trim().length < 2}
                     >
                        {saving ? 'Creating…' : 'Create project'}
                     </Button>
                  </div>
               </form>
            </DialogContent>
         </Dialog>
      </div>
   );
}
