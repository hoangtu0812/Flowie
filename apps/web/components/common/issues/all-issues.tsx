'use client';

import { Issue } from '@/mock-data/issues';
import { Status, StatusCategory } from '@/mock-data/status';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { applyIssueFilters } from './issue-filter-columns';
import { IssueFilterBar } from './issue-filter-bar';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useSearchStore } from '@/store/search-store';
import { useViewStore } from '@/store/view-store';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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
   const { isSearchOpen, searchQuery } = useSearchStore();
   const { viewType } = useViewStore();
   const { filters } = useFilterStore();
   const showSubIssues = useDisplaySettingsStore((state) => state.showSubIssues);
   const { issues, statuses: workflowStatuses, loading, loadIssues } = useIssuesStore();
   const { openPanel } = useRightPanelStore();
   const params = useParams<{ teamId?: string | string[] }>();
   const teamIdentifier = Array.isArray(params.teamId) ? params.teamId[0] : params.teamId;
   const [isInitialLoad, setIsInitialLoad] = useState(true);

   const isSearching = isSearchOpen && searchQuery.trim() !== '';
   const isViewTypeGrid = viewType === 'grid';

   useEffect(() => {
      let active = true;
      void loadIssues(teamIdentifier).finally(() => {
         if (active) setIsInitialLoad(false);
      });
      return () => {
         active = false;
      };
   }, [loadIssues, teamIdentifier]);

   const statuses = useMemo<Status[]>(() => {
      const liveStatuses = workflowStatuses.length
         ? workflowStatuses
         : Array.from(new Map(issues.map((issue) => [issue.status.id, issue.status])).values());
      return categories
         ? liveStatuses.filter((current) => categories.includes(current.category))
         : liveStatuses;
   }, [issues, workflowStatuses, categories]);

   const scopedIssues = useMemo<Issue[]>(() => {
      // Sub-issues are ordinary issues in the list; the Display option decides
      // whether they show alongside their parent or stay tucked under it.
      const visible = showSubIssues ? issues : issues.filter((issue) => !issue.parentIssueId);
      return categories
         ? visible.filter((issue) => categories.includes(issue.status.category))
         : visible;
   }, [issues, categories, showSubIssues]);

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

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <IssueFilterBar />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={scopedIssues}
                  statuses={statuses}
                  isViewTypeGrid={isViewTypeGrid}
                  loading={loading || isInitialLoad}
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
