'use client';

import { loadCurrentWorkspaceTeams } from '@/components/common/teams/team-types';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Cycle } from '@/mock-data/cycles';
import { useIssuesStore } from '@/store/issues-store';
import { format, parseISO } from 'date-fns';
import { useParams } from 'next/navigation';
import { Fragment, useCallback, useEffect, useState } from 'react';
import CycleLine from './cycle-line';
import { CycleBurnupChart, CycleProgressLegend } from './cycle-burnup-chart';

type ApiCycle = {
   id: string;
   name: string;
   status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELED';
   startDate: string | null;
   endDate: string | null;
   createdAt: string;
   _count: { issueLinks: number };
   progress: Pick<Cycle, 'scope' | 'scopeDelta' | 'started' | 'completed' | 'burnup'>;
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const toCycleStatus = (status: ApiCycle['status']): Cycle['status'] =>
   status === 'ACTIVE'
      ? 'current'
      : status === 'UPCOMING'
        ? 'upcoming'
        : status === 'COMPLETED'
          ? 'completed'
          : 'planned';

/**
 * The Circle timeline is preserved intact.  Its summary fields are derived
 * from the real issues linked to each cycle, rather than from the old sample
 * timeline data.
 */
export default function Cycles() {
   const { teamId } = useParams<{ teamId: string }>();
   const { loadIssues } = useIssuesStore();
   const [cycles, setCycles] = useState<Cycle[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [resolvedTeamId, setResolvedTeamId] = useState<string>();
   const [createOpen, setCreateOpen] = useState(false);
   const [name, setName] = useState('');
   const [startDate, setStartDate] = useState('');
   const [endDate, setEndDate] = useState('');
   const [saving, setSaving] = useState(false);
   const [createError, setCreateError] = useState<string>();

   const loadCycles = useCallback(async () => {
      setLoading(true);
      setError(undefined);
      try {
         const { workspaceId, teams } = await loadCurrentWorkspaceTeams();
         const team = teams.find(
            (item) => item.id === teamId || item.identifier.toLowerCase() === teamId.toLowerCase()
         );
         if (!team) throw new Error('This team is not available to the current user.');
         setWorkspaceId(workspaceId);
         setResolvedTeamId(team.id);

         await loadIssues(team.identifier);
         const response = await fetch(
            `${api}/cycles?${new URLSearchParams({ workspaceId, teamId: team.id }).toString()}`,
            { credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not load cycles.');
         const payload = (await response.json()) as { data: ApiCycle[] };
         setCycles(
            payload.data.map((cycle, index) => {
               const { scope, scopeDelta, started, completed, burnup } = cycle.progress;
               return {
                  id: cycle.id,
                  number: payload.data.length - index,
                  name: cycle.name,
                  teamId: team.identifier,
                  status: toCycleStatus(cycle.status),
                  startDate: cycle.startDate ?? cycle.createdAt,
                  endDate: cycle.endDate ?? cycle.startDate ?? cycle.createdAt,
                  capacity: scope ? Math.round(((started + completed) / scope) * 100) : 0,
                  scope,
                  scopeDelta,
                  started,
                  completed,
                  successRate: scope ? Math.round((completed / scope) * 100) : 0,
                  burnup,
               };
            })
         );
      } catch (caught) {
         setCycles([]);
         setError(caught instanceof Error ? caught.message : 'Could not load cycles.');
      } finally {
         setLoading(false);
      }
   }, [loadIssues, teamId]);

   useEffect(() => {
      void loadCycles();
   }, [loadCycles]);

   useEffect(() => {
      const openCreate = () => {
         setCreateError(undefined);
         setCreateOpen(true);
      };
      window.addEventListener('flowie:create-cycle', openCreate);
      return () => window.removeEventListener('flowie:create-cycle', openCreate);
   }, []);

   const createCycle = async () => {
      if (!workspaceId || !resolvedTeamId || name.trim().length < 2) return;
      if (startDate && endDate && endDate < startDate) {
         setCreateError('End date must be on or after the start date.');
         return;
      }
      setSaving(true);
      setCreateError(undefined);
      try {
         const response = await fetch(`${api}/cycles`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId,
               teamId: resolvedTeamId,
               name: name.trim(),
               status: 'UPCOMING',
               ...(startDate ? { startDate } : {}),
               ...(endDate ? { endDate } : {}),
            }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not create cycle.');
         }
         setCreateOpen(false);
         setName('');
         setStartDate('');
         setEndDate('');
         await loadCycles();
      } catch (caught) {
         setCreateError(caught instanceof Error ? caught.message : 'Could not create cycle.');
      } finally {
         setSaving(false);
      }
   };

   if (loading) {
      return <div className="px-6 py-4 text-sm text-muted-foreground">Loading cycles…</div>;
   }

   if (error) {
      return <div className="px-6 py-4 text-sm text-destructive">{error}</div>;
   }

   return (
      <>
         <div className="w-full py-4">
            {cycles.length === 0 && (
               <div className="px-6 py-8 text-sm text-muted-foreground">No cycles yet.</div>
            )}
            {cycles.map((cycle) => (
               <Fragment key={cycle.id}>
                  <div className="w-full flex items-stretch">
                     <div className="relative w-14 sm:w-20 shrink-0 flex flex-col items-end pr-4">
                        <div className="absolute right-[20.5px] top-0 bottom-0 w-px bg-border" />
                        <div className="flex items-center gap-2 h-12">
                           <span className="text-[11px] leading-tight text-muted-foreground text-right">
                              {format(parseISO(cycle.startDate), 'MMM')}
                              <br />
                              {format(parseISO(cycle.startDate), 'd')}
                           </span>
                           <span
                              className={
                                 'relative z-10 size-2.5 rounded-full border-2 bg-background ' +
                                 (cycle.status === 'current'
                                    ? 'border-indigo-400 bg-indigo-400'
                                    : 'border-muted-foreground/40')
                              }
                           />
                        </div>
                     </div>
                     <div className="flex-1 min-w-0 border-b border-border/60">
                        <CycleLine cycle={cycle} />
                        {cycle.status === 'current' && (
                           <div className="flex flex-col lg:flex-row items-stretch gap-8 px-6 pb-6 pt-2">
                              <div className="flex-1 min-w-0">
                                 <CycleBurnupChart cycle={cycle} height={220} />
                              </div>
                              <div className="lg:w-64 shrink-0 flex items-center">
                                 <CycleProgressLegend cycle={cycle} />
                              </div>
                           </div>
                        )}
                     </div>
                  </div>
               </Fragment>
            ))}
         </div>
         <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="sm:max-w-[480px]">
               <DialogHeader>
                  <DialogTitle>Create cycle</DialogTitle>
                  <DialogDescription>
                     Add an upcoming cycle to this team. You can assign issues from their cycle
                     property.
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <Input
                     value={name}
                     onChange={(event) => setName(event.target.value)}
                     placeholder="Cycle name"
                     minLength={2}
                     maxLength={120}
                     autoFocus
                  />
                  <div className="grid grid-cols-2 gap-3">
                     <Input
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                        aria-label="Cycle start date"
                     />
                     <Input
                        type="date"
                        value={endDate}
                        onChange={(event) => setEndDate(event.target.value)}
                        aria-label="Cycle end date"
                     />
                  </div>
                  {createError && <p className="text-sm text-destructive">{createError}</p>}
               </div>
               <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                     Cancel
                  </Button>
                  <Button
                     onClick={() => void createCycle()}
                     disabled={saving || name.trim().length < 2}
                  >
                     {saving ? 'Creating…' : 'Create cycle'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </>
   );
}
