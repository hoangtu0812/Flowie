'use client';

import { useIssueQuery } from '@/features/issues/use-issue-query';
import { CycleDetailsPanel } from '@/components/common/cycles/cycle-details-panel';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { DesignSurface } from '@/components/common/design-surface';
import { useLiveCycle } from '@/components/common/cycles/use-live-cycle';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { applyIssueFilters } from './issue-filter-columns';
import { IssueFilterBar } from './issue-filter-bar';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useSearchStore } from '@/store/search-store';
import { useViewStore } from '@/store/view-store';
import { useMemo } from 'react';
import { GroupedIssuesView } from './grouped-issues-view';
import { InsightsPanel } from './insights-panel';
import { SearchIssues } from './search-issues';

export type CycleView = 'active' | 'upcoming';

interface CycleIssuesProps {
   /** 'active' = current cycle, 'upcoming' = next cycle. */
   cycleView: CycleView;
}

/**
 * Issue view scoped to a cycle — same behavior as AllIssues (search,
 * filters, list/board) plus the cycle details / insights side panels.
 */
export default function CycleIssues({ cycleView }: CycleIssuesProps) {
   const { isSearchOpen, searchQuery } = useSearchStore();
   const { viewType } = useViewStore();
   const { filters } = useFilterStore();
   const { issues, statuses, error } = useIssuesStore();
   const { openPanel } = useRightPanelStore();
   const { cycle, loading, error: cycleError, retry: retryCycle } = useLiveCycle(cycleView);
   const queryState = useIssueQuery(undefined, { cycleId: cycle?.id }, Boolean(cycle));

   const isSearching = isSearchOpen && searchQuery.trim() !== '';
   const isViewTypeGrid = viewType === 'grid';

   const cycleIssues = useMemo(
      () => issues.filter((issue) => cycle && issue.cycleId === cycle.id),
      [issues, cycle]
   );

   const displayedIssues = useMemo(
      () => applyIssueFilters(cycleIssues, filters),
      [cycleIssues, filters]
   );

   if (loading) return <LoadingState label="Loading cycle…" />;
   if (cycleError) return <QueryState message={cycleError} onRetry={retryCycle} />;
   if (!cycle)
      return (
         <DesignSurface>
            <EmptyState
               title={`No ${cycleView} cycle`}
               description="Create or schedule a cycle from the team's Cycles page."
            />
         </DesignSurface>
      );

   if (isSearching) {
      return (
         <div className="w-full h-full">
            <div className="px-6 mb-6">
               <SearchIssues issues={displayedIssues} />
            </div>
         </div>
      );
   }

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <IssueFilterBar />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={cycleIssues}
                  statuses={statuses}
                  isViewTypeGrid={isViewTypeGrid}
                  loading={queryState.loading}
                  error={error}
                  onRetry={queryState.retry}
               />
            </div>

            {openPanel === 'insights' && (
               <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <InsightsPanel />
               </aside>
            )}
            {openPanel === 'cycle-details' && cycle && (
               <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <CycleDetailsPanel cycle={cycle} issues={cycleIssues} />
               </aside>
            )}
         </div>
      </div>
   );
}
