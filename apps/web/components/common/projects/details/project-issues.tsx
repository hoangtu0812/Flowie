'use client';

import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { useEffect, useMemo } from 'react';
import { toIssueUi, toProjectDetailUi, toProjectUi } from './project-detail-ui-adapter';
import { ProjectSidePanel } from './project-side-panel';
import { useLiveProjectData } from './use-live-project';

interface ProjectIssuesProps {
   projectId: string;
}

/** Project "Issues" tab: the project's issues grouped by status. */
export default function ProjectIssues({ projectId }: ProjectIssuesProps) {
   void projectId;
   const {
      project: liveProject,
      issues: liveIssues,
      milestones,
      updates,
      activities,
      loading,
      error,
   } = useLiveProjectData();
   const { filters } = useFilterStore();
   // Rows here share the issue components, whose assignee picker and cycle
   // names read the issues store; nothing else on this route populates it.
   const loadIssues = useIssuesStore((state) => state.loadIssues);
   useEffect(() => {
      void loadIssues();
   }, [loadIssues]);
   const project = useMemo(
      () => (liveProject ? toProjectUi(liveProject, liveIssues) : null),
      [liveProject, liveIssues]
   );
   const detail = useMemo(
      () => (liveProject ? toProjectDetailUi(liveProject, milestones, updates, activities) : null),
      [activities, liveProject, milestones, updates]
   );
   const issues = useMemo(
      () => (project ? liveIssues.map((issue) => toIssueUi(issue, project)) : []),
      [liveIssues, project]
   );

   // Filters (filter bar + click-to-filter from the insights panel) apply
   // on top of the project scope.
   const displayedIssues = useMemo(() => applyIssueFilters(issues, filters), [issues, filters]);
   const statuses = useMemo(
      () => Array.from(new Map(issues.map((issue) => [issue.status.id, issue.status])).values()),
      [issues]
   );

   if (loading)
      return (
         <div className="h-full grid place-items-center text-sm text-muted-foreground">
            Loading project…
         </div>
      );
   if (error || !project || !detail)
      return (
         <div className="h-full grid place-items-center text-sm text-destructive">
            {error ?? 'Project not found.'}
         </div>
      );

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
            <ProjectSidePanel
               project={project}
               detail={detail}
               issues={issues}
               insightsIssues={displayedIssues}
            />
         </div>
      </div>
   );
}
