'use client';

import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { useEffect, useMemo } from 'react';
import { toIssueUi, toProjectDetailUi, toProjectUi } from './project-detail-ui-adapter';
import { ProjectSidePanel } from './project-side-panel';
import { useLiveProject } from './use-live-project';

interface ProjectIssuesProps {
   projectId: string;
}

/** Project Issues retains the original grouped Circle list, scoped to API issues. */
export default function ProjectIssues({ projectId }: ProjectIssuesProps) {
   const { statuses, loadIssues } = useIssuesStore();
   const { filters } = useFilterStore();
   const {
      project,
      issues,
      milestones,
      updates,
      activities,
      availableLabels,
      availableMembers,
      updateLabels,
      updateMembers,
      createMilestone,
      toggleMilestone,
      loading,
      error,
   } = useLiveProject(projectId);

   useEffect(() => {
      void loadIssues();
   }, [loadIssues]);

   const uiProject = useMemo(
      () => (project ? toProjectUi(project, issues) : undefined),
      [issues, project]
   );
   const detail = useMemo(
      () => (project ? toProjectDetailUi(project, milestones, updates, activities) : undefined),
      [activities, milestones, project, updates]
   );
   const uiIssues = useMemo(
      () => (uiProject ? issues.map((issue) => toIssueUi(issue, uiProject)) : []),
      [issues, uiProject]
   );
   const displayedIssues = useMemo(() => applyIssueFilters(uiIssues, filters), [filters, uiIssues]);

   if (loading)
      return <div className="px-6 py-4 text-sm text-muted-foreground">Loading project issues…</div>;
   if (error || !project || !uiProject || !detail)
      return (
         <div className="px-6 py-4 text-sm text-destructive">{error ?? 'Project not found.'}</div>
      );

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <IssueFilterBar />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={uiIssues}
                  statuses={statuses}
                  isViewTypeGrid={false}
               />
            </div>
            <ProjectSidePanel
               project={uiProject}
               detail={detail}
               issues={uiIssues}
               insightsIssues={displayedIssues}
               availableLabels={availableLabels}
               availableMembers={availableMembers}
               onLabelsChange={updateLabels}
               onMembersChange={updateMembers}
               onCreateMilestone={createMilestone}
               onToggleMilestone={toggleMilestone}
            />
         </div>
      </div>
   );
}
