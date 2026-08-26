'use client';

import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { InsightsPanel } from '@/components/common/issues/insights-panel';
import ProjectsList from '@/components/common/projects/projects-list';
import { ProjectGroup } from '@/components/common/projects/projects';
import { useProjectsData } from '@/features/projects/projects-data';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useEffect, useMemo } from 'react';
import { LiveView, useLiveViews } from './use-live-views';

const filterValues = (filters: Record<string, unknown>, key: string) =>
   Array.isArray(filters[key]) ? (filters[key] as string[]) : [];

function IssueViewBody({ view }: { view: LiveView }) {
   const { openPanel } = useRightPanelStore();
   const { issues, statuses, loadIssues } = useIssuesStore();
   useEffect(() => {
      void loadIssues();
   }, [loadIssues]);
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
               />
            </div>
            {openPanel === 'insights' && (
               <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <InsightsPanel issues={filtered} />
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
   return <ProjectsList groups={groups} />;
}

/** Saved view detail backed by persisted view filters and live issue/project data. */
export default function ViewDetails({ viewId }: { viewId: string }) {
   const { views, loading, error } = useLiveViews();
   const view = views.find((candidate) => candidate.id === viewId);
   if (loading)
      return (
         <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
            Loading view…
         </div>
      );
   if (!view || error)
      return (
         <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
            View not found
         </div>
      );
   return view.entityType === 'issue' ? (
      <IssueViewBody view={view} />
   ) : (
      <ProjectViewBody view={view} />
   );
}
