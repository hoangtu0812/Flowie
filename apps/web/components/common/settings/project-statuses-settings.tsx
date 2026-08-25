'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusIcon } from '@/lib/status-presentations';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { SettingsShell } from './shared';

type Category = 'backlog' | 'planned' | 'in-progress' | 'completed' | 'canceled';
type ProjectStatus = { id: string; name: string; category: Category; color: string; position: number; projectCount: number };
type Draft = { name: string; category: Category; color: string };

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const GROUPS: Array<{ label: string; category: Category }> = [
   { label: 'Backlog', category: 'backlog' }, { label: 'Planned', category: 'planned' },
   { label: 'In Progress', category: 'in-progress' }, { label: 'Completed', category: 'completed' },
   { label: 'Canceled', category: 'canceled' },
];
const COLORS: Record<Category, string> = { backlog: '#95a2b3', planned: '#99a2b2', 'in-progress': '#facc15', completed: '#5e6ad2', canceled: '#95a2b3' };
const initialDraft = (category: Category): Draft => ({ name: '', category, color: COLORS[category] });

async function errorMessage(response: Response, fallback: string) {
   const payload = (await response.json().catch(() => null)) as { message?: string | string[] } | null;
   return Array.isArray(payload?.message) ? payload.message[0] : payload?.message ?? fallback;
}

/** Existing Circle workflow settings presentation, now backed by FastAPI/PostgreSQL. */
export default function ProjectStatusesSettings() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [statuses, setStatuses] = useState<ProjectStatus[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [selected, setSelected] = useState<ProjectStatus>();
   const [draft, setDraft] = useState<Draft>(initialDraft('backlog'));
   const [open, setOpen] = useState(false);
   const [saving, setSaving] = useState(false);
   const [message, setMessage] = useState<string>();

   const load = useCallback(async () => {
      const id = (await loadCurrentWorkspace()).id;
      const response = await authenticatedFetch(`${api}/projects/statuses?workspaceId=${id}`);
      if (!response.ok) throw new Error('Could not load project statuses.');
      setWorkspaceId(id);
      setStatuses(((await response.json()) as { data: ProjectStatus[] }).data);
   }, []);

   useEffect(() => { void load().then(() => setState('ready')).catch(() => setState('error')); }, [load]);
   const grouped = useMemo(() => GROUPS.map((group) => ({ ...group, statuses: statuses.filter((status) => status.category === group.category).sort((left, right) => left.position - right.position || left.name.localeCompare(right.name)) })), [statuses]);
   const showCreate = (category: Category) => { setSelected(undefined); setDraft(initialDraft(category)); setMessage(undefined); setOpen(true); };
   const showEdit = (status: ProjectStatus) => { setSelected(status); setDraft({ name: status.name, category: status.category, color: status.color }); setMessage(undefined); setOpen(true); };

   const save = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !draft.name.trim()) return;
      setSaving(true); setMessage(undefined);
      try {
         const response = await authenticatedFetch(selected ? `${api}/projects/statuses/${selected.id}?workspaceId=${workspaceId}` : `${api}/projects/statuses`, {
            method: selected ? 'PATCH' : 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...(selected ? {} : { workspaceId }), name: draft.name.trim(), category: draft.category, color: draft.color }),
         });
         if (!response.ok) throw new Error(await errorMessage(response, 'Could not save project status.'));
         await load(); setOpen(false);
      } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not save project status.'); }
      finally { setSaving(false); }
   };

   const remove = async () => {
      if (!workspaceId || !selected) return;
      setSaving(true); setMessage(undefined);
      try {
         const response = await authenticatedFetch(`${api}/projects/statuses/${selected.id}?workspaceId=${workspaceId}`, { method: 'DELETE' });
         if (!response.ok) throw new Error(await errorMessage(response, 'Could not delete project status.'));
         await load(); setOpen(false);
      } catch (caught) { setMessage(caught instanceof Error ? caught.message : 'Could not delete project status.'); }
      finally { setSaving(false); }
   };

   return <SettingsShell title="Project statuses" description="Project statuses define the workflow that projects go through from start to completion">
      <div className="rounded-lg border bg-container overflow-hidden">
         {state === 'loading' && <div className="px-4 py-3 text-xs text-muted-foreground">Loading statuses…</div>}
         {state === 'error' && <div className="px-4 py-3 text-xs text-destructive">Could not load project statuses.</div>}
         {state === 'ready' && grouped.map((group) => <div key={group.category}>
            <div className="flex items-center justify-between px-4 py-2 bg-accent/30 border-y first:border-t-0 border-border/50">
               <span className="text-sm text-muted-foreground">{group.label}</span>
               <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label={`Add ${group.label} status`} onClick={() => showCreate(group.category)}><Plus className="size-3.5" /></button>
            </div>
            {group.statuses.length === 0 && <div className="px-4 py-3 text-xs text-muted-foreground">No statuses</div>}
            {group.statuses.map((status) => <button type="button" key={status.id} onClick={() => showEdit(status)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/30">
               <span className="inline-flex size-8 items-center justify-center rounded-md bg-muted/50 shrink-0"><StatusIcon statusId={status.name} /></span>
               <div><div className="text-sm font-medium">{status.name}</div><div className="text-xs text-muted-foreground">{status.projectCount} {status.projectCount === 1 ? 'project' : 'projects'}</div></div>
            </button>)}
         </div>)}
      </div>
      <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{selected ? 'Edit project status' : 'New project status'}</DialogTitle><DialogDescription>Statuses are shared by projects in this workspace.</DialogDescription></DialogHeader>
         <form className="grid gap-4" onSubmit={save}>
            <div className="grid gap-2"><Label htmlFor="project-status-name">Name</Label><Input id="project-status-name" value={draft.name} autoFocus onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} /></div>
            <div className="grid gap-2"><Label>Category</Label><Select value={draft.category} onValueChange={(category: Category) => setDraft((current) => ({ ...current, category }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{GROUPS.map((group) => <SelectItem key={group.category} value={group.category}>{group.label}</SelectItem>)}</SelectContent></Select></div>
            <div className="grid gap-2"><Label htmlFor="project-status-color">Color</Label><div className="flex gap-2"><Input aria-label="Project status color picker" type="color" value={draft.color} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))} className="w-10 p-1" /><Input id="project-status-color" value={draft.color} pattern="^#[0-9a-fA-F]{6}$" onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))} /></div></div>
            {message && <p className="text-sm text-destructive">{message}</p>}
            <DialogFooter>{selected && <Button type="button" variant="ghost" className="mr-auto text-destructive" disabled={saving} onClick={() => void remove()}>Delete</Button>}<Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving || !draft.name.trim()}>{saving ? 'Saving...' : selected ? 'Save changes' : 'Create status'}</Button></DialogFooter>
         </form>
      </DialogContent></Dialog>
   </SettingsShell>;
}
