'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { loadJoinedWorkspaceTeams, type WorkspaceTeam } from '@/components/common/teams/team-types';
import { authenticatedFetch } from '@/lib/workspaces';
import { type Cycle } from '@/types/cycles';
import { format, parseISO } from 'date-fns';
import { Plus } from 'lucide-react';
import { useParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useState } from 'react';
import CycleLine from './cycle-line';
import { CycleBurnupChart, CycleProgressLegend } from './cycle-burnup-chart';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
type ApiCycle = {
   id: string;
   name: string;
   description?: string | null;
   status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELED';
   startDate?: string | null;
   endDate?: string | null;
   createdAt: string;
   progress: Pick<Cycle, 'scope' | 'scopeDelta' | 'started' | 'completed' | 'burnup'>;
};
type Draft = { name: string; description: string; status: 'UPCOMING' | 'ACTIVE'; startDate: string; endDate: string };
const emptyDraft: Draft = { name: '', description: '', status: 'UPCOMING', startDate: '', endDate: '' };

const toCycle = (cycle: ApiCycle, team: WorkspaceTeam): Cycle => {
   const progress = cycle.progress;
   const complete = progress.scope ? Math.round((progress.completed / progress.scope) * 100) : 0;
   return {
      id: cycle.id,
      number: 0,
      name: cycle.name,
      teamId: team.identifier,
      status:
         cycle.status === 'ACTIVE' ? 'current' : cycle.status === 'COMPLETED' ? 'completed' : cycle.status === 'UPCOMING' ? 'upcoming' : 'planned',
      startDate: cycle.startDate ?? cycle.createdAt,
      endDate: cycle.endDate ?? cycle.startDate ?? cycle.createdAt,
      capacity: progress.scope ? Math.round(((progress.started + progress.completed) / progress.scope) * 100) : 0,
      scope: progress.scope,
      scopeDelta: progress.scopeDelta,
      started: progress.started,
      completed: progress.completed,
      successRate: complete,
      burnup: progress.burnup,
   };
};

/** Original Circle cycle timeline backed by native FastAPI records. */
export default function Cycles() {
   const { teamId } = useParams<{ teamId: string }>();
   const [team, setTeam] = useState<WorkspaceTeam>();
   const [cycles, setCycles] = useState<Cycle[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [open, setOpen] = useState(false);
   const [draft, setDraft] = useState<Draft>(emptyDraft);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   const load = useCallback(async () => {
      const context = await loadJoinedWorkspaceTeams();
      const currentTeam = context.teams.find((item) => item.id === teamId || item.identifier.toLowerCase() === teamId.toLowerCase());
      if (!currentTeam) throw new Error('Team not found.');
      const response = await authenticatedFetch(`${api}/cycles?${new URLSearchParams({ workspaceId: context.workspaceId, teamId: currentTeam.id })}`);
      if (!response.ok) throw new Error('Could not load cycles.');
      const payload = (await response.json()) as { data: ApiCycle[] };
      setTeam(currentTeam);
      setCycles(payload.data.map((cycle) => toCycle(cycle, currentTeam)));
   }, [teamId]);

   useEffect(() => {
      setState('loading');
      void load().then(() => setState('ready')).catch(() => setState('error'));
   }, [load]);

   const create = async () => {
      if (!team || draft.name.trim().length < 2) return;
      setSaving(true);
      setError(undefined);
      try {
         const context = await loadJoinedWorkspaceTeams();
         const response = await authenticatedFetch(`${api}/cycles`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId: context.workspaceId,
               teamId: team.id,
               name: draft.name.trim(),
               description: draft.description.trim() || undefined,
               status: draft.status,
               startDate: draft.startDate || undefined,
               endDate: draft.endDate || undefined,
            }),
         });
         if (!response.ok) {
            const body = (await response.json().catch(() => null)) as { message?: string } | null;
            throw new Error(body?.message ?? 'Could not create cycle.');
         }
         await load();
         setDraft(emptyDraft);
         setOpen(false);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not create cycle.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <div className="w-full py-4">
         <div className="flex justify-end px-6 pb-3">
            <Button size="xs" onClick={() => { setDraft(emptyDraft); setError(undefined); setOpen(true); }} disabled={state !== 'ready'}>
               <Plus className="size-3.5" /> Create cycle
            </Button>
         </div>
         {state === 'loading' && <p className="px-6 py-10 text-sm text-muted-foreground">Loading cycles…</p>}
         {state === 'error' && <p className="px-6 py-10 text-sm text-destructive">Could not load cycles.</p>}
         {state === 'ready' && cycles.length === 0 && <p className="px-6 py-10 text-sm text-muted-foreground">No cycles yet.</p>}
         {cycles.map((cycle) => (
            <Fragment key={cycle.id}>
               <div className="w-full flex items-stretch">
                  <div className="relative w-14 sm:w-20 shrink-0 flex flex-col items-end pr-4">
                     <div className="absolute right-[20.5px] top-0 bottom-0 w-px bg-border" />
                     <div className="flex items-center gap-2 h-12">
                        <span className="text-[11px] leading-tight text-muted-foreground text-right">{format(parseISO(cycle.startDate), 'MMM')}<br />{format(parseISO(cycle.startDate), 'd')}</span>
                        <span className={'relative z-10 size-2.5 rounded-full border-2 bg-background ' + (cycle.status === 'current' ? 'border-indigo-400 bg-indigo-400' : 'border-muted-foreground/40')} />
                     </div>
                  </div>
                  <div className="flex-1 min-w-0 border-b border-border/60">
                     <CycleLine cycle={cycle} />
                     {cycle.status === 'current' && <div className="flex flex-col lg:flex-row items-stretch gap-8 px-6 pb-6 pt-2"><div className="flex-1 min-w-0"><CycleBurnupChart cycle={cycle} height={220} /></div><div className="lg:w-64 shrink-0 flex items-center"><CycleProgressLegend cycle={cycle} /></div></div>}
                  </div>
               </div>
            </Fragment>
         ))}
         <Dialog open={open} onOpenChange={(visible) => !saving && setOpen(visible)}>
            <DialogContent>
               <DialogHeader><DialogTitle>Create cycle</DialogTitle></DialogHeader>
               <div className="space-y-4">
                  <div className="space-y-2"><Label htmlFor="cycle-name">Name</Label><Input id="cycle-name" value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} autoFocus minLength={2} /></div>
                  <div className="space-y-2"><Label htmlFor="cycle-description">Description</Label><Textarea id="cycle-description" value={draft.description} onChange={(event) => setDraft((value) => ({ ...value, description: event.target.value }))} rows={2} /></div>
                  <div className="space-y-2"><Label>Status</Label><Select value={draft.status} onValueChange={(status) => setDraft((value) => ({ ...value, status: status as Draft['status'] }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="UPCOMING">Upcoming</SelectItem><SelectItem value="ACTIVE">Active</SelectItem></SelectContent></Select></div>
                  <div className="grid grid-cols-2 gap-3"><div className="space-y-2"><Label htmlFor="cycle-start">Start date</Label><Input id="cycle-start" type="date" value={draft.startDate} onChange={(event) => setDraft((value) => ({ ...value, startDate: event.target.value }))} /></div><div className="space-y-2"><Label htmlFor="cycle-end">End date</Label><Input id="cycle-end" type="date" value={draft.endDate} onChange={(event) => setDraft((value) => ({ ...value, endDate: event.target.value }))} /></div></div>
                  {error && <p className="text-sm text-destructive">{error}</p>}
               </div>
               <DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button><Button onClick={() => void create()} disabled={saving || draft.name.trim().length < 2}>{saving ? 'Creating…' : 'Create cycle'}</Button></DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
