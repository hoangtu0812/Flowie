'use client';

import { loadCurrentWorkspaceTeams } from '@/components/common/teams/team-types';
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

   const loadCycles = useCallback(async () => {
      setLoading(true);
      setError(undefined);
      try {
         const { workspaceId, teams } = await loadCurrentWorkspaceTeams();
         const team = teams.find(
            (item) => item.id === teamId || item.identifier.toLowerCase() === teamId.toLowerCase()
         );
         if (!team) throw new Error('This team is not available to the current user.');

         await loadIssues(team.identifier);
         const response = await fetch(
            `${api}/cycles?${new URLSearchParams({ workspaceId, teamId: team.id }).toString()}`,
            { credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not load cycles.');
         const payload = (await response.json()) as { data: ApiCycle[] };
         const issues = useIssuesStore.getState().issues;
         setCycles(
            payload.data.map((cycle, index) => {
               const linkedIssues = issues.filter((issue) => issue.cycleId === cycle.id);
               const scope = linkedIssues.length || cycle._count.issueLinks;
               const completed = linkedIssues.filter(
                  (issue) => issue.status.category === 'completed'
               ).length;
               const started = linkedIssues.filter(
                  (issue) => issue.status.category === 'started'
               ).length;
               return {
                  id: cycle.id,
                  number: payload.data.length - index,
                  name: cycle.name,
                  teamId: team.identifier,
                  status: toCycleStatus(cycle.status),
                  startDate: cycle.startDate ?? cycle.createdAt,
                  endDate: cycle.endDate ?? cycle.startDate ?? cycle.createdAt,
                  capacity: scope ? Math.round((completed / scope) * 100) : 0,
                  scope,
                  scopeDelta: 0,
                  started,
                  completed,
                  successRate: scope ? Math.round((completed / scope) * 100) : 0,
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

   if (loading) {
      return <div className="px-6 py-4 text-sm text-muted-foreground">Loading cycles…</div>;
   }

   if (error) {
      return <div className="px-6 py-4 text-sm text-destructive">{error}</div>;
   }

   if (cycles.length === 0) {
      return <div className="px-6 py-8 text-sm text-muted-foreground">No cycles yet.</div>;
   }

   return (
      <div className="w-full py-4">
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
   );
}
