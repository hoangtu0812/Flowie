'use client';

import { Circle, CircleCheck, CircleDashed, CirclePlay, CircleX, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { SettingsShell } from './shared';

type ApiProject = { id: string; status: string };
type WorkflowCategory = 'backlog' | 'planned' | 'in-progress' | 'completed' | 'canceled';
type ProjectStatus = {
   id: string;
   name: string;
   Icon: ComponentType<{ className?: string }>;
   count: number;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const CATEGORY_GROUPS: Array<{ label: string; category: WorkflowCategory }> = [
   { label: 'Backlog', category: 'backlog' },
   { label: 'Planned', category: 'planned' },
   { label: 'In Progress', category: 'in-progress' },
   { label: 'Completed', category: 'completed' },
   { label: 'Canceled', category: 'canceled' },
];

const categoryFor = (value: string): WorkflowCategory => {
   const normalized = value.trim().toLowerCase().replace(/_/g, '-');
   if (normalized === 'backlog' || normalized === 'triage') return 'backlog';
   if (normalized === 'completed' || normalized === 'done') return 'completed';
   if (normalized === 'canceled' || normalized === 'cancelled') return 'canceled';
   if (['active', 'started', 'in-progress', 'in progress'].includes(normalized))
      return 'in-progress';
   return 'planned';
};

const iconFor = (category: WorkflowCategory) => {
   if (category === 'backlog') return CircleDashed;
   if (category === 'in-progress') return CirclePlay;
   if (category === 'completed') return CircleCheck;
   if (category === 'canceled') return CircleX;
   return Circle;
};

const statusName = (value: string) => {
   const normalized = value.trim();
   if (!normalized) return 'Planned';
   return normalized
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
};

/** Original project-status settings layout backed by live project records. */
export default function ProjectStatusesSettings() {
   const [projects, setProjects] = useState<ApiProject[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspacePayload = (await workspaceResponse.json()) as {
         data: Array<{ workspace: { id: string } }>;
      };
      const workspaceId = workspacePayload.data[0]?.workspace.id;
      if (!workspaceId) throw new Error('No workspace is available.');

      const projectResponse = await fetch(`${api}/projects?workspaceId=${workspaceId}`, {
         credentials: 'include',
      });
      if (!projectResponse.ok) throw new Error('Could not load projects.');
      setProjects(((await projectResponse.json()) as { data: ApiProject[] }).data);
   }, []);

   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);

   const groups = useMemo(
      () =>
         CATEGORY_GROUPS.map((group) => {
            const statuses = new Map<string, ProjectStatus>();
            for (const project of projects) {
               const rawStatus = project.status.trim() || 'planned';
               if (categoryFor(rawStatus) !== group.category) continue;
               const id = rawStatus.toLowerCase();
               const existing = statuses.get(id);
               if (existing) existing.count += 1;
               else {
                  statuses.set(id, {
                     id,
                     name: statusName(rawStatus),
                     Icon: iconFor(group.category),
                     count: 1,
                  });
               }
            }
            return {
               ...group,
               statuses: [...statuses.values()].sort((left, right) => right.count - left.count),
            };
         }),
      [projects]
   );

   return (
      <SettingsShell
         title="Project statuses"
         description="Project statuses define the workflow that projects go through from start to completion"
      >
         <div className="rounded-lg border bg-container overflow-hidden">
            {state === 'loading' && (
               <div className="px-4 py-4 text-sm text-muted-foreground">
                  Loading project statuses…
               </div>
            )}
            {state === 'error' && (
               <div className="px-4 py-4 text-sm text-destructive">
                  Could not load project statuses.
               </div>
            )}
            {state === 'ready' &&
               groups.map((group) => (
                  <div key={group.label}>
                     <div className="flex items-center justify-between px-4 py-2 bg-accent/30 border-y first:border-t-0 border-border/50">
                        <span className="text-sm text-muted-foreground">{group.label}</span>
                        <button
                           type="button"
                           disabled
                           title="Project status configuration is not available yet"
                           className="text-muted-foreground/50 cursor-not-allowed"
                        >
                           <Plus className="size-3.5" />
                        </button>
                     </div>
                     {group.statuses.length === 0 && (
                        <div className="px-4 py-3 text-xs text-muted-foreground">
                           No project statuses
                        </div>
                     )}
                     {group.statuses.map((status) => (
                        <div key={status.id} className="flex items-center gap-3 px-4 py-3">
                           <span className="inline-flex size-8 items-center justify-center rounded-md bg-muted/50 shrink-0">
                              <status.Icon className="size-4" />
                           </span>
                           <div>
                              <div className="text-sm font-medium">{status.name}</div>
                              <div className="text-xs text-muted-foreground">
                                 {status.count} {status.count === 1 ? 'project' : 'projects'}
                              </div>
                           </div>
                        </div>
                     ))}
                  </div>
               ))}
         </div>
      </SettingsShell>
   );
}
