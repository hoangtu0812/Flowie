'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useProjectsData } from '@/features/projects/projects-data';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { BarChart3, Box, Layers, MoreHorizontal, Star } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { useLiveViews } from '@/components/common/views/use-live-views';

const values = (filters: Record<string, unknown>, key: string) =>
   Array.isArray(filters[key]) ? (filters[key] as string[]) : [];

export default function Header() {
   const { viewId } = useParams<{ viewId: string }>();
   const { views, loading } = useLiveViews();
   const { issues, loadIssues } = useIssuesStore();
   const { allProjects } = useProjectsData();
   const { openPanel, togglePanel } = useRightPanelStore();
   useEffect(() => {
      void loadIssues();
   }, [loadIssues]);
   const view = views.find((candidate) => candidate.id === viewId);
   const count = useMemo(() => {
      if (!view) return 0;
      const priorities = values(view.filters, 'priorityIds');
      const teamId = typeof view.filters.teamId === 'string' ? view.filters.teamId : undefined;
      if (view.entityType === 'project')
         return allProjects.filter(
            (project) =>
               (!priorities.length || priorities.includes(project.priority.id)) &&
               (!teamId || project.teamId === teamId)
         ).length;
      const categories = values(view.filters, 'statusCategories');
      const statuses = values(view.filters, 'statusIds');
      return issues.filter(
         (issue) =>
            (!categories.length || categories.includes(issue.status.category)) &&
            (!statuses.length || statuses.includes(issue.status.id)) &&
            (!teamId || issue.teamId === teamId)
      ).length;
   }, [allProjects, issues, view]);
   if (loading || !view) return null;
   const Icon = view.entityType === 'issue' ? Layers : Box;
   return (
      <div className="w-full flex flex-col">
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div className="flex items-center gap-2 min-w-0">
               <SidebarTrigger />
               <span className="inline-flex size-5 items-center justify-center rounded bg-muted/50 text-xs shrink-0">
                  <Icon className="size-3.5" />
               </span>
               <span className="text-sm font-medium truncate">{view.name}</span>
               <Star className="size-3.5 text-muted-foreground shrink-0 ml-1" />
               <MoreHorizontal className="size-3.5 text-muted-foreground shrink-0" />
            </div>
         </div>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <span className="text-xs text-muted-foreground">
               {count} {view.entityType === 'issue' ? 'issues' : 'projects'}
            </span>
            {view.entityType === 'issue' && (
               <Button
                  size="xs"
                  variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
                  onClick={() => togglePanel('insights')}
               >
                  <BarChart3 className="size-4" />
               </Button>
            )}
         </div>
      </div>
   );
}
