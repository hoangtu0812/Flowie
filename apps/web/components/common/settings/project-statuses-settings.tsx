'use client';

import { Circle, CircleCheck, CircleDashed, CirclePlay, CircleX, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { SettingsShell } from './shared';
import { loadCurrentWorkspace } from '@/lib/workspaces';

type WorkflowCategory = 'backlog' | 'planned' | 'in-progress' | 'completed' | 'canceled';
type ProjectStatus = {
   id: string;
   name: string;
   category: WorkflowCategory;
   color: string;
   position: number;
   projectCount: number;
};
type StatusDraft = { name: string; category: WorkflowCategory; color: string };
const EMPTY_DRAFT: StatusDraft = { name: '', category: 'planned', color: '#95a2b3' };

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const CATEGORY_GROUPS: Array<{ label: string; category: WorkflowCategory }> = [
   { label: 'Backlog', category: 'backlog' },
   { label: 'Planned', category: 'planned' },
   { label: 'In Progress', category: 'in-progress' },
   { label: 'Completed', category: 'completed' },
   { label: 'Canceled', category: 'canceled' },
];

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
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [dialog, setDialog] = useState<'create' | 'edit'>();
   const [selected, setSelected] = useState<ProjectStatus>();
   const [draft, setDraft] = useState<StatusDraft>(EMPTY_DRAFT);
   const [saving, setSaving] = useState(false);
   const [message, setMessage] = useState<string>();

   const load = useCallback(async () => {
      const workspaceId = (await loadCurrentWorkspace()).id;
      setWorkspaceId(workspaceId);

      const projectResponse = await fetch(`${api}/projects/statuses?workspaceId=${workspaceId}`, {
         credentials: 'include',
      });
      if (!projectResponse.ok) throw new Error('Could not load project statuses.');
      setStatuses(((await projectResponse.json()) as { data: ProjectStatus[] }).data);
   }, []);

   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);

   const groups = useMemo(
      () =>
         CATEGORY_GROUPS.map((group) => {
            return {
               ...group,
               statuses: statuses.filter((status) => status.category === group.category),
            };
         }),
      [statuses]
   );
   const openCreate = (category: WorkflowCategory) => {
      setSelected(undefined);
      setDraft({ ...EMPTY_DRAFT, category });
      setMessage(undefined);
      setDialog('create');
   };
   const openEdit = (status: ProjectStatus) => {
      setSelected(status);
      setDraft({ name: status.name, category: status.category, color: status.color });
      setMessage(undefined);
      setDialog('edit');
   };
   const save = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !draft.name.trim()) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const editing = dialog === 'edit' && selected;
         const response = await fetch(
            editing
               ? `${api}/projects/statuses/${selected.id}?workspaceId=${workspaceId}`
               : `${api}/projects/statuses`,
            {
               method: editing ? 'PATCH' : 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(editing ? {} : { workspaceId }),
                  name: draft.name,
                  category: draft.category,
                  color: draft.color,
               }),
            }
         );
         if (!response.ok) throw new Error('Could not save project status.');
         await load();
         setDialog(undefined);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not save project status.');
      } finally {
         setSaving(false);
      }
   };
   const remove = async () => {
      if (!workspaceId || !selected) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await fetch(
            `${api}/projects/statuses/${selected.id}?workspaceId=${workspaceId}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not delete project status.');
         }
         await load();
         setDialog(undefined);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not delete project status.');
      } finally {
         setSaving(false);
      }
   };

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
                           onClick={() => openCreate(group.category)}
                           className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                           <Plus className="size-3.5" />
                        </button>
                     </div>
                     {group.statuses.length === 0 && (
                        <div className="px-4 py-3 text-xs text-muted-foreground">
                           No project statuses
                        </div>
                     )}
                     {group.statuses.map((status) => {
                        const Icon = iconFor(status.category);
                        return (
                           <button
                              key={status.id}
                              type="button"
                              onClick={() => openEdit(status)}
                              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-sidebar/50"
                           >
                              <span className="inline-flex size-8 items-center justify-center rounded-md bg-muted/50 shrink-0">
                                 <Icon className="size-4" style={{ color: status.color }} />
                              </span>
                              <div>
                                 <div className="text-sm font-medium">
                                    {statusName(status.name)}
                                 </div>
                                 <div className="text-xs text-muted-foreground">
                                    {status.projectCount}{' '}
                                    {status.projectCount === 1 ? 'project' : 'projects'}
                                 </div>
                              </div>
                           </button>
                        );
                     })}
                  </div>
               ))}
         </div>
         <Dialog open={Boolean(dialog)} onOpenChange={(open) => !open && setDialog(undefined)}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>
                     {dialog === 'edit' ? 'Edit project status' : 'New project status'}
                  </DialogTitle>
               </DialogHeader>
               <form className="space-y-4" onSubmit={save}>
                  <div className="space-y-2">
                     <Label htmlFor="project-status-name">Name</Label>
                     <Input
                        id="project-status-name"
                        value={draft.name}
                        onChange={(event) =>
                           setDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        required
                     />
                  </div>
                  <div className="space-y-2">
                     <Label>Category</Label>
                     <Select
                        value={draft.category}
                        onValueChange={(category: WorkflowCategory) =>
                           setDraft((current) => ({ ...current, category }))
                        }
                     >
                        <SelectTrigger>
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {CATEGORY_GROUPS.map((group) => (
                              <SelectItem key={group.category} value={group.category}>
                                 {group.label}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="space-y-2">
                     <Label htmlFor="project-status-color">Color</Label>
                     <Input
                        id="project-status-color"
                        type="color"
                        value={draft.color}
                        onChange={(event) =>
                           setDraft((current) => ({ ...current, color: event.target.value }))
                        }
                        className="h-9 w-14 p-1"
                     />
                  </div>
                  {message && <p className="text-sm text-destructive">{message}</p>}
                  <DialogFooter className="sm:justify-between">
                     {dialog === 'edit' ? (
                        <Button
                           type="button"
                           variant="ghost"
                           className="text-destructive"
                           disabled={saving || Boolean(selected?.projectCount)}
                           onClick={() => void remove()}
                        >
                           Delete
                        </Button>
                     ) : (
                        <span />
                     )}
                     <div className="flex gap-2">
                        <Button
                           type="button"
                           variant="outline"
                           onClick={() => setDialog(undefined)}
                        >
                           Cancel
                        </Button>
                        <Button type="submit" disabled={saving || !draft.name.trim()}>
                           {saving ? 'Saving…' : 'Save'}
                        </Button>
                     </div>
                  </DialogFooter>
               </form>
            </DialogContent>
         </Dialog>
      </SettingsShell>
   );
}
