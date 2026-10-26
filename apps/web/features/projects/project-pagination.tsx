'use client';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { useProjectsData } from './projects-data';

export function ProjectPagination() {
   const {
      allProjects,
      projectPage,
      loadingMore,
      workspaceLoading,
      pageError: error,
      loadMoreProjects,
      refreshProjects,
   } = useProjectsData();
   if (!projectPage) return null;
   return (
      <DesignSurface>
         <HStack
            paddingInline={4}
            paddingBlock={2}
            gap={3}
            justify="between"
            wrap="wrap"
            className="border-b border-border/50"
         >
            <Text type="supporting">
               Loaded projects: {allProjects.length} of {projectPage.total}. Filters and reports
               apply to loaded projects.
            </Text>
            {error && <Text role="alert">{error}</Text>}
            {projectPage.nextCursor && (
               <Button
                  label={error ? 'Retry more projects' : 'Load more projects'}
                  onClick={() => void loadMoreProjects()}
                  isLoading={loadingMore}
                  isDisabled={workspaceLoading}
               />
            )}
            {error && <Button label="Reload project list" onClick={() => void refreshProjects()} />}
         </HStack>
      </DesignSurface>
   );
}
