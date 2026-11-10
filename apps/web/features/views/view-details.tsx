'use client';

import { useMemo } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { ProjectPagination } from '@/features/projects/project-pagination';
import { useIssueQuery } from '@/features/issues/use-issue-query';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { IssueFilterTrigger } from '@/components/common/issues/issue-filter-trigger';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { InsightsPanel } from '@/components/common/issues/insights-panel';
import ProjectsList from '@/features/projects/projects-list';
import { ProjectGroup } from '@/features/projects/projects';
import { useProjectsData } from '@/features/projects/projects-data';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { FilterDefaultsContext, useFilterStore } from '@/store/filter-store';
import { LiveView, useLiveViews } from './use-live-views';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { usePageEntity } from '@/features/shared/document-title';
import { useMessages } from '@/features/shared/use-messages';
import { captureIssueView, isIssueViewConfig, type IssueViewConfig } from '@/features/views/config';
import { ViewActions } from '@/features/views/view-actions';
import { ScopeSummary } from '@/features/views/view-editor';
import { messages } from '@/features/views/messages.vi';

function IssueViewBody({
   view,
   config,
   workspaceId,
   currentUserId,
}: {
   view: LiveView;
   config: IssueViewConfig;
   workspaceId: string;
   currentUserId?: string;
}) {
   const tx = useMessages(messages);
   const { openPanel } = useRightPanelStore();
   const { issues, statuses, error, pageQuery } = useIssuesStore();
   const { filters } = useFilterStore();
   const { filters: savedFilters, ...query } = config.query;
   const queryState = useIssueQuery(config.teamId, query);
   const currentConfig =
      !queryState.loading && pageQuery
         ? captureIssueView(pageQuery)
         : { ...config, query: { ...query, filters } };
   const changed = JSON.stringify(filters) !== JSON.stringify(savedFilters);
   return (
      <VStack height="100%" minHeight={0} gap={0}>
         <DesignSurface>
            <HStack
               paddingInline={6}
               paddingBlock={2}
               gap={3}
               justify="between"
               wrap="wrap"
               className="border-b"
            >
               <VStack gap={1}>
                  <ScopeSummary config={config} />
                  {changed && <Text type="supporting">{tx('Temporary changes')}</Text>}
               </VStack>
               <HStack gap={2} wrap="wrap">
                  <IssueFilterTrigger />
                  <ViewActions
                     view={view}
                     config={currentConfig}
                     workspaceId={workspaceId}
                     currentUserId={currentUserId}
                     disabled={queryState.loading || !!error}
                     dirty={changed}
                  />
                  {changed && (
                     <Button
                        label={tx('Reload view')}
                        size="sm"
                        variant="ghost"
                        onClick={() => window.location.assign(window.location.pathname)}
                     />
                  )}
               </HStack>
            </HStack>
         </DesignSurface>
         <IssueFilterBar />
         <HStack
            height="100%"
            minHeight={0}
            gap={0}
            align="stretch"
            className="flex-1 overflow-hidden"
         >
            <VStack minHeight={0} className="flex-1 min-w-0 overflow-hidden">
               <GroupedIssuesView
                  issues={issues}
                  totalIssues={issues}
                  statuses={statuses}
                  isViewTypeGrid={false}
                  loading={queryState.loading}
                  error={error}
                  onRetry={queryState.retry}
               />
            </VStack>
            {openPanel === 'insights' && (
               <VStack
                  width={420}
                  minHeight={0}
                  className="hidden lg:flex shrink-0 border-l overflow-hidden"
               >
                  <InsightsPanel />
               </VStack>
            )}
         </HStack>
      </VStack>
   );
}

function ProjectViewBody({ view }: { view: LiveView }) {
   const { allProjects } = useProjectsData();
   const groups = useMemo<ProjectGroup[]>(() => {
      const priorities = Array.isArray(view.filters.priorityIds)
         ? (view.filters.priorityIds as string[])
         : [];
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

export default function ViewDetails({ viewId }: { viewId: string }) {
   const tx = useMessages(messages);
   const { views, workspaceId, currentUserId, loading, error, reload } = useLiveViews();
   const view = views.find((candidate) => candidate.id === viewId);
   usePageEntity(view?.name);
   if (loading) return <Text>{tx('Loading view…')}</Text>;
   if (error)
      return (
         <RecoveryScreen title={tx('Could not load this view')} message={error} retry={reload} />
      );
   if (!view || !workspaceId)
      return (
         <RecoveryScreen
            title={tx('View not found')}
            message={tx('This view was removed or is outside your access.')}
         />
      );
   if (view.configurationError || (view.entityType === 'issue' && !isIssueViewConfig(view.filters)))
      return (
         <DesignSurface>
            <VStack gap={3} padding={6}>
               <Text>{tx('Invalid view configuration')}</Text>
               <Text type="supporting">{view.configurationError}</Text>
               <ViewActions
                  view={view}
                  config={view.filters}
                  workspaceId={workspaceId}
                  currentUserId={currentUserId}
                  disabled
               />
            </VStack>
         </DesignSurface>
      );
   if (view.entityType === 'project')
      return (
         <>
            <DesignSurface>
               <HStack padding={3}>
                  <ViewActions
                     view={view}
                     config={view.filters}
                     workspaceId={workspaceId}
                     currentUserId={currentUserId}
                  />
               </HStack>
            </DesignSurface>
            <ProjectViewBody view={view} />
         </>
      );
   const config = view.filters as IssueViewConfig;
   return (
      <FilterDefaultsContext.Provider value={config.query.filters}>
         <IssueViewBody
            key={`${view.id}:${view.updatedAt}`}
            view={view}
            config={config}
            workspaceId={workspaceId}
            currentUserId={currentUserId}
         />
      </FilterDefaultsContext.Provider>
   );
}
