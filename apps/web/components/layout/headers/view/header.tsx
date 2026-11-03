'use client';

import { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { IssueListActions } from '@/features/issues/issue-list-actions';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useProjectsData } from '@/features/projects/projects-data';
import { useIssuesStore } from '@/store/issues-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useLiveViews } from '@/components/common/views/use-live-views';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/views/messages.vi';

export default function Header() {
   const tx = useMessages(messages);
   const { viewId } = useParams<{ viewId: string }>();
   const { views, loading } = useLiveViews();
   const { page, loading: issuesLoading } = useIssuesStore();
   const { allProjects } = useProjectsData();
   const { openPanel, togglePanel } = useRightPanelStore();
   const view = views.find((candidate) => candidate.id === viewId);
   const count = useMemo(() => {
      if (!view) return 0;
      if (view.entityType === 'issue') return issuesLoading ? '…' : (page?.total ?? '…');
      const priorities = Array.isArray(view.filters.priorityIds)
         ? (view.filters.priorityIds as string[])
         : [];
      const teamId = typeof view.filters.teamId === 'string' ? view.filters.teamId : undefined;
      return allProjects.filter(
         (project) =>
            (!priorities.length || priorities.includes(project.priority.id)) &&
            (!teamId || project.teamId === teamId)
      ).length;
   }, [allProjects, page, issuesLoading, view]);
   if (loading || !view) return null;
   return (
      <VStack width="100%">
         <DesignSurface>
            <VStack gap={0}>
               <HStack paddingInline={6} paddingBlock={2} gap={2} className="border-b">
                  <SidebarTrigger />
                  <Text weight="medium" maxLines={1}>
                     {view.name}
                  </Text>
                  <Text type="supporting">{tx(view.isShared ? 'Shared' : 'Private')}</Text>
               </HStack>
               <HStack
                  paddingInline={6}
                  paddingBlock={2}
                  gap={2}
                  justify="between"
                  wrap="wrap"
                  className="border-b"
               >
                  <Text type="supporting">
                     {tx(view.entityType === 'issue' ? '{count} issues' : '{count} projects', {
                        count,
                     })}
                  </Text>
                  {view.entityType === 'issue' && !view.configurationError && (
                     <HStack gap={2}>
                        <IssueListActions />
                        <Button
                           label={tx('Show insights')}
                           size="sm"
                           variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
                           onClick={() => togglePanel('insights')}
                        />
                     </HStack>
                  )}
               </HStack>
            </VStack>
         </DesignSurface>
      </VStack>
   );
}
