'use client';

import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { InsightsPanel } from '@/components/common/issues/insights-panel';
import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useEffect, useMemo } from 'react';

interface ProjectIssuesProps {
   projectId: string;
}

/** Project Issues retains the original grouped Circle list, scoped to API issues. */
export default function ProjectIssues({ projectId }: ProjectIssuesProps) {
   const { issues: allIssues, statuses, loadIssues, isLoading } = useIssuesStore();
   const { filters } = useFilterStore();
   const { openPanel } = useRightPanelStore();

   useEffect(() => {
      void loadIssues();
   }, [loadIssues]);

   const issues = useMemo(
      () => allIssues.filter((issue) => issue.project?.id === projectId),
      [allIssues, projectId]
   );
   const displayedIssues = useMemo(() => applyIssueFilters(issues, filters), [issues, filters]);

   if (isLoading)
      return <div className="px-6 py-4 text-sm text-muted-foreground">Loading project issues…</div>;

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <IssueFilterBar />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={issues}
                  statuses={statuses}
                  isViewTypeGrid={false}
               />
            </div>
            {openPanel === 'insights' && (
               <aside className="hidden xl:flex w-[380px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <InsightsPanel issues={displayedIssues} />
               </aside>
            )}
         </div>
      </div>
   );
}
