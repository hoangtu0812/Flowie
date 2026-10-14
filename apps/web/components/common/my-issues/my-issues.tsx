'use client';

import { useIssueQuery } from '@/features/issues/use-issue-query';
import { IssuePagination } from '@/features/issues/issue-pagination';
import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { InsightsPanel } from '@/components/common/issues/insights-panel';
import { SearchIssues } from '@/components/common/issues/search-issues';
import { BreakdownPanel } from './breakdown-panel';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useSearchStore } from '@/store/search-store';
import { useViewStore } from '@/store/view-store';
import { useMemo } from 'react';
import { scopeMyIssues, useCurrentUserId, useMyIssuesTab } from './use-my-issues';

/**
 * "My issues" body — the exact same machinery as the team issue views
 * (search, filter bar, list/board display, insights panel), scoped to the
 * current tab (Assigned / Created / Subscribed / Activity).
 */
export default function MyIssues() {
   const [tab] = useMyIssuesTab();
   const { isSearchOpen, searchQuery } = useSearchStore();
   const { viewType } = useViewStore();
   const { filters } = useFilterStore();
   const { issues, statuses, error } = useIssuesStore();
   const { openPanel } = useRightPanelStore();
   const queryState = useIssueQuery(undefined, { scope: tab });

   const isSearching = isSearchOpen && searchQuery.trim() !== '';
   const isViewTypeGrid = viewType === 'grid';

   const currentUserId = useCurrentUserId();

   const scopedIssues = useMemo(
      () => (tab === 'activity' ? issues : scopeMyIssues(issues, tab, currentUserId)),
      [issues, tab, currentUserId]
   );

   const displayedIssues = useMemo(
      () => applyIssueFilters(scopedIssues, filters),
      [scopedIssues, filters]
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
         <IssuePagination />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={scopedIssues}
                  statuses={statuses}
                  isViewTypeGrid={isViewTypeGrid}
                  error={error}
                  onRetry={queryState.retry}
                  loading={queryState.loading}
               />
            </div>

            {openPanel === 'insights' && (
               <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <InsightsPanel issues={displayedIssues} />
               </aside>
            )}
            {openPanel === 'breakdown' && (
               <aside className="hidden lg:flex w-80 shrink-0 border-l h-full overflow-hidden bg-container">
                  <BreakdownPanel issues={displayedIssues} />
               </aside>
            )}
         </div>
      </div>
   );
}
