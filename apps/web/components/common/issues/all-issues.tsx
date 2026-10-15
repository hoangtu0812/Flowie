'use client';

import { useIssueQuery } from '@/features/issues/use-issue-query';
import { HStack, VStack } from '@astryxdesign/core/Layout';
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
import { useMemo } from 'react';
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
   const { issues, statuses: workflowStatuses, error } = useIssuesStore();
   const { openPanel } = useRightPanelStore();
   const params = useParams<{ teamId?: string | string[] }>();
   const teamIdentifier = Array.isArray(params.teamId) ? params.teamId[0] : params.teamId;
   const queryState = useIssueQuery(teamIdentifier, { categories });

   const isSearching = isSearchOpen && searchQuery.trim() !== '';
   const isViewTypeGrid = viewType === 'grid';

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
         <HStack width="100%" height="100%">
            <VStack padding={6}>
               <SearchIssues issues={displayedIssues} />
            </VStack>
         </HStack>
      );
   }

   return (
      <VStack width="100%" height="100%" className="overflow-hidden">
         <IssueFilterBar />
         <HStack gap={0} className="flex-1 min-h-0 w-full overflow-hidden">
            <VStack className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={scopedIssues}
                  statuses={statuses}
                  isViewTypeGrid={isViewTypeGrid}
                  error={error}
                  onRetry={queryState.retry}
                  loading={queryState.loading}
               />
            </VStack>

            {openPanel === 'insights' && (
               <VStack
                  as="aside"
                  width={420}
                  className="hidden lg:flex shrink-0 border-l h-full overflow-hidden bg-container"
               >
                  <InsightsPanel />
               </VStack>
            )}
         </HStack>
      </VStack>
   );
}
