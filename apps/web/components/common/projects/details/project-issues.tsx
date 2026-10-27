'use client';

import { useIssueQuery } from '@/features/issues/use-issue-query';
import { QueryState } from '@/components/common/query-state';
import { LoadingState } from '@/components/common/loading-state';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { useFilterStore } from '@/store/filter-store';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { useViewStore } from '@/store/view-store';
import { useIssuesStore } from '@/store/issues-store';
import { useMemo } from 'react';
import { toProjectDetailUi, toProjectUi } from './project-detail-ui-adapter';
import { ProjectSidePanel } from './project-side-panel';
import { useLiveProjectData } from './use-live-project';

interface ProjectIssuesProps {
   projectId: string;
}

/**
 * Project "Issues" tab: the project's issues as a list or board, grouped and ordered by the
 * shared Display options.
 * VI: Tab "Issues" của dự án: issue của dự án dạng list hoặc board, nhóm và sắp xếp theo tùy
 * VI: chọn Display dùng chung.
 */
export default function ProjectIssues({ projectId }: ProjectIssuesProps) {
   const queryState = useIssueQuery(undefined, { projectId });
   const queryIssues = useIssuesStore((state) => state.issues);
   const queryError = useIssuesStore((state) => state.error);
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
   const showSubIssues = useDisplaySettingsStore((state) => state.showSubIssues);
   // Same list/board choice as All issues; the group rows read it too, so passing a fixed
   // value here drew board groups under the list's column header.
   // VI: Dùng chung lựa chọn list/board với All issues; các dòng nhóm cũng đọc giá trị này,
   // VI: nên truyền cứng ở đây từng vẽ nhóm kiểu board dưới thanh tiêu đề cột của list.
   const isViewTypeGrid = useViewStore((state) => state.viewType) === 'grid';
   const project = useMemo(
      () => (liveProject ? toProjectUi(liveProject, liveIssues) : null),
      [liveProject, liveIssues]
   );
   const detail = useMemo(
      () => (liveProject ? toProjectDetailUi(liveProject, milestones, updates, activities) : null),
      [activities, liveProject, milestones, updates]
   );
   const issues = useMemo(
      () =>
         project
            ? queryIssues.filter(
                 (issue) =>
                    issue.project?.id === projectId && (showSubIssues || !issue.parentIssueId)
              )
            : [],
      [queryIssues, project, projectId, showSubIssues]
   );

   // Filters (filter bar + click-to-filter from the insights panel) apply
   // on top of the project scope.
   const displayedIssues = useMemo(() => applyIssueFilters(issues, filters), [issues, filters]);
   const statuses = useMemo(
      () => Array.from(new Map(issues.map((issue) => [issue.status.id, issue.status])).values()),
      [issues]
   );

   if (loading) return <LoadingState label="Loading project…" />;
   if (error || !project || !detail)
      return <QueryState message={error ?? 'Project unavailable.'} />;

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <IssueFilterBar />
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={displayedIssues}
                  totalIssues={issues}
                  statuses={statuses}
                  isViewTypeGrid={isViewTypeGrid}
                  loading={queryState.loading}
                  error={queryError}
                  onRetry={queryState.retry}
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
