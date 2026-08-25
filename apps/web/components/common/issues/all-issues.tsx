'use client';

import { Issue } from '@/types/issues';
import { StatusCategory } from '@/lib/status-presentations';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { applyIssueFilters } from './issue-filter-columns';
import { IssueFilterBar } from './issue-filter-bar';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useSearchStore } from '@/store/search-store';
import { useViewStore } from '@/store/view-store';
import { useEffect, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { GroupedIssuesView } from './grouped-issues-view';
import { InsightsPanel } from './insights-panel';
import { SearchIssues } from './search-issues';

interface AllIssuesProps {
   /**
    * Optional status-category filter, used by the "Active" and "Backlog"
    * tabs. When omitted, every status is shown ("All issues").
    */
   categories?: StatusCategory[];
}

export default function AllIssues({ categories }: AllIssuesProps) {
   const { teamId } = useParams<{ teamId?: string }>();
   const { isSearchOpen, searchQuery } = useSearchStore();
   const { viewType } = useViewStore();
   const { filters } = useFilterStore();
   const { issues, statuses, loadIssues, isLoading, error } = useIssuesStore();
   const { openPanel } = useRightPanelStore();

   useEffect(() => {
      void loadIssues(teamId);
   }, [loadIssues, teamId]);

   const isSearching = isSearchOpen && searchQuery.trim() !== '';
   const isViewTypeGrid = viewType === 'grid';

   const displayStatuses = useMemo(
      () => (categories ? statuses.filter((item) => categories.includes(item.category)) : statuses),
      [categories, statuses]
   );

   const scopedIssues = useMemo<Issue[]>(
      () =>
         categories ? issues.filter((issue) => categories.includes(issue.status.category)) : issues,
      [issues, categories]
   );

   const displayedIssues = useMemo(
      () => applyIssueFilters(scopedIssues, filters),
      [scopedIssues, filters]
   );

   if (isSearching) {
      return (
         <div className="w-full h-full">
            <div className="px-6 mb-6">
               <SearchIssues />
            </div>
         </div>
      );
   }

   if (isLoading) {
      return <div className="px-6 py-4 text-sm text-muted-foreground">Loading issues…</div>;
   }

   if (error) {
      return <div className="px-6 py-4 text-sm text-destructive">{error}</div>;
   }

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <IssueFilterBar />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={scopedIssues}
                  statuses={displayStatuses}
                  isViewTypeGrid={isViewTypeGrid}
               />
            </div>

            {openPanel === 'insights' && (
               <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <InsightsPanel issues={displayedIssues} />
               </aside>
            )}
         </div>
      </div>
   );
}
