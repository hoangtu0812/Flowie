'use client';

import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { InsightsPanel } from '@/components/common/issues/insights-panel';
import ProjectsList from '@/components/common/projects/projects-list';
import { ProjectGroup } from '@/components/common/projects/projects';
import { displayOrderedStatus } from '@/mock-data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useEffect, useMemo } from 'react';
import { viewIssues, viewProjects } from './view-filter';
import { useLiveViews } from './use-live-views';

/** Saved view detail applies the persisted server filter to live issue/project data. */
export default function ViewDetails({ viewId }: { viewId: string }) {
   const { views, loading, error } = useLiveViews();
   const { issues, projects, loadIssues, isLoading } = useIssuesStore();
   const { openPanel } = useRightPanelStore();
   useEffect(() => {
      void loadIssues();
   }, [loadIssues]);
   const view = views.find((entry) => entry.id === viewId);
   const scopedIssues = useMemo(
      () => (view?.entityType === 'issue' ? viewIssues(view, issues) : []),
      [issues, view]
   );
   const groups = useMemo<ProjectGroup[]>(() => {
      if (!view || view.entityType !== 'project') return [];
      const grouped = new Map<string, ProjectGroup>();
      for (const project of viewProjects(view, projects)) {
         const key = project.status.id;
         if (!grouped.has(key))
            grouped.set(key, { id: key, name: project.status.name, projects: [] });
         grouped.get(key)!.projects.push(project);
      }
      return [...grouped.values()];
   }, [projects, view]);
   if (loading || isLoading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading view…</div>;
   if (error || !view)
      return (
         <div className="px-8 py-10 text-sm text-destructive">{error ?? 'View not found.'}</div>
      );
   if (view.entityType === 'project') return <ProjectsList groups={groups} />;
   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <div className="flex-1 min-h-0 w-full flex overflow-hidden">
            <div className="flex-1 min-w-0 h-full overflow-hidden">
               <GroupedIssuesView
                  issues={scopedIssues}
                  totalIssues={scopedIssues}
                  statuses={displayOrderedStatus}
                  isViewTypeGrid={false}
               />
            </div>
            {openPanel === 'insights' && (
               <aside className="hidden lg:flex w-[420px] shrink-0 border-l h-full overflow-hidden bg-container">
                  <InsightsPanel issues={scopedIssues} />
               </aside>
            )}
         </div>
      </div>
   );
}
