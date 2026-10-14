'use client';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { useIssuesStore } from '@/store/issues-store';
export function IssuePagination() {
   const { issues, page, loading, loadingMore, loadMore, pageError } = useIssuesStore();
   if (!page) return null;
   return (
      <DesignSurface>
         <HStack gap={3} justify="between" padding={3} wrap="wrap">
            <Text type="supporting">
               {issues.length} of {page.total} matching issues loaded. Counts and insights describe
               loaded rows.
            </Text>
            {pageError && <Text role="alert">{pageError}</Text>}
            {page.nextCursor && (
               <Button
                  label={pageError ? 'Retry more issues' : 'Load more issues'}
                  size="sm"
                  isLoading={loadingMore}
                  isDisabled={loading}
                  clickAction={loadMore}
               />
            )}
         </HStack>
      </DesignSurface>
   );
}
