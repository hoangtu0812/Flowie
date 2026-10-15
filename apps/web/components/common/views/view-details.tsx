'use client';
import { ProjectPagination } from '@/features/projects/project-pagination';

import { useIssueQuery } from '@/features/issues/use-issue-query';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { InsightsPanel } from '@/components/common/issues/insights-panel';
import ProjectsList from '@/components/common/projects/projects-list';
import { ProjectGroup } from '@/components/common/projects/projects';
import { useProjectsData } from '@/features/projects/projects-data';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useMemo } from 'react';
import { LiveView, useLiveViews } from './use-live-views';
import { RecoveryScreen } from '@/features/shared/recovery-screen';

const filterValues = (filters: Record<string, unknown>, key: string) =>
   Array.isArray(filters[key]) ? (filters[key] as string[]) : [];

function IssueViewBody({ view }: { view: LiveView }) {
   const { openPanel } = useRightPanelStore();
   const { issues, statuses, error } = useIssuesStore();
   const queryFilters = [];
   for (const [key, columnId, type, operator] of [
      ['statusIds', 'status', 'option', 'is any of'],
      ['priorityIds', 'priority', 'option', 'is any of'],
      ['labelIds', 'labels', 'multiOption', 'include any of'],
   ]) {
      const values = filterValues(view.filters, key);
      if (values.length) queryFilters.push({ columnId, type, operator, values });
   }
   if (view.filters.unassigned === true)
      queryFilters.push({
         columnId: 'assignee',
         type: 'option',
         operator: 'is',
         values: ['unassigned'],
      });
   if (view.filters.hasProject === true)
      queryFilters.push({ columnId: 'project', type: 'option', operator: 'is not', values: [''] });
   const queryState = useIssueQuery(
      typeof view.filters.teamId === 'string' ? view.filters.teamId : undefined,
      { categories: filterValues(view.filters, 'statusCategories'), filters: queryFilters }
   );
   const filtered = useMemo(() => {
      const categories = filterValues(view.filters, 'statusCategories');
      const statusIds = filterValues(view.filters, 'statusIds');
      const labelIds = filterValues(view.filters, 'labelIds');
      const priorityIds = filterValues(view.filters, 'priorityIds');
      const teamId = typeof view.filters.teamId === 'string' ? view.filters.teamId : undefined;
      return issues.filter((issue) => {
         if (categories.length && !categories.includes(issue.status.category)) return false;
         if (statusIds.length && !statusIds.includes(issue.status.id)) return false;
         if (labelIds.length && !issue.labels.some((label) => labelIds.includes(label.id)))
            return false;
         if (priorityIds.length && !priorityIds.includes(issue.priority.id)) return false;
         if (view.filters.hasProject === true && !issue.project) return false;
         if (view.filters.unassigned === true && issue.assignee) return false;
         return !teamId || issue.teamId === teamId;
      });
   }, [issues, view]);
   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={filtered}
                  totalIssues={filtered}
                  statuses={statuses}
                  isViewTypeGrid={false}
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
         </div>
      </div>
   );
}

function ProjectViewBody({ view }: { view: LiveView }) {
   const { allProjects } = useProjectsData();
   const groups = useMemo<ProjectGroup[]>(() => {
      const priorities = filterValues(view.filters, 'priorityIds');
      const teamId = typeof view.filters.teamId === 'string' ? view.filters.teamId : undefined;
      const projects = allProjects.filter(
         (project) =>
            (!priorities.length || priorities.includes(project.priority.id)) &&
            (!teamId || project.teamId === teamId)
      );
      const byStatus = new Map<string, ProjectGroup>();
      for (const project of projects) {
         const key = project.status.id;
         if (!byStatus.has(key))
            byStatus.set(key, { id: key, name: project.status.name, projects: [] });
         byStatus.get(key)!.projects.push(project);
      }
      return [...byStatus.values()];
   }, [allProjects, view]);
   return (
      <>
         <ProjectPagination />
         <ProjectsList groups={groups} />
      </>
   );
}

/** Saved view detail backed by persisted view filters and live issue/project data. */
export default function ViewDetails({ viewId }: { viewId: string }) {
   const { views, loading, error, errorStatus, reload } = useLiveViews();
   const view = views.find((candidate) => candidate.id === viewId);
   if (loading)
      return (
         <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
            Loading view…
         </div>
      );
   if (error)
      return (
         <RecoveryScreen
            title={errorStatus === 403 ? 'Access unavailable' : 'Could not load this view'}
            message={errorStatus === 0 ? 'Check your connection and try again.' : error}
            retry={reload}
         />
      );
   if (!view)
      return (
         <RecoveryScreen
            title="View not found"
            message="This view was removed or is outside your access."
         />
      );
   return view.entityType === 'issue' ? (
      <IssueViewBody view={view} />
   ) : (
      <ProjectViewBody view={view} />
   );
}
