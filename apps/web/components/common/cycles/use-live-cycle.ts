'use client';

import { loadJoinedWorkspaceTeams, WorkspaceTeam } from '@/components/common/teams/team-types';
import { Cycle } from '@/mock-data/cycles';
import { useIssuesStore } from '@/store/issues-store';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export type LiveCycleView = 'active' | 'upcoming';

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

const mapCycle = (cycle: ApiCycle, team: WorkspaceTeam): Cycle => {
   const { scope, scopeDelta, started, completed, burnup } = cycle.progress;
   const progress = scope ? Math.round((completed / scope) * 100) : 0;
   return {
      id: cycle.id,
      number: 0,
      name: cycle.name,
      teamId: team.identifier,
      status: cycle.status === 'ACTIVE' ? 'current' : 'upcoming',
      startDate: cycle.startDate ?? cycle.createdAt,
      endDate: cycle.endDate ?? cycle.startDate ?? cycle.createdAt,
      capacity: scope ? Math.round(((started + completed) / scope) * 100) : 0,
      scope,
      scopeDelta,
      started,
      completed,
      successRate: progress,
      burnup,
   };
};

/** Loads the active/upcoming cycle and the matching real issue collection. */
export function useLiveCycle(cycleView: LiveCycleView) {
   const { teamId } = useParams<{ teamId: string }>();
   const { loadIssues } = useIssuesStore();
   const [team, setTeam] = useState<WorkspaceTeam>();
   const [cycle, setCycle] = useState<Cycle>();
   const [loading, setLoading] = useState(true);

   useEffect(() => {
      let active = true;
      void (async () => {
         setLoading(true);
         try {
            const { workspaceId, teams } = await loadJoinedWorkspaceTeams();
            const currentTeam = teams.find(
               (item) =>
                  item.id === teamId || item.identifier.toLowerCase() === teamId.toLowerCase()
            );
            if (!currentTeam) throw new Error('Team not found.');
            await loadIssues(currentTeam.identifier);
            const status = cycleView === 'active' ? 'ACTIVE' : 'UPCOMING';
            const response = await fetch(
               `${api}/cycles?${new URLSearchParams({ workspaceId, teamId: currentTeam.id, status }).toString()}`,
               { credentials: 'include' }
            );
            if (!response.ok) throw new Error('Could not load cycle.');
            const payload = (await response.json()) as { data: ApiCycle[] };
            if (active) {
               setTeam(currentTeam);
               setCycle(payload.data[0] ? mapCycle(payload.data[0], currentTeam) : undefined);
            }
         } catch {
            if (active) {
               setTeam(undefined);
               setCycle(undefined);
            }
         } finally {
            if (active) setLoading(false);
         }
      })();
      return () => {
         active = false;
      };
   }, [cycleView, loadIssues, teamId]);

   return { team, cycle, loading };
}
