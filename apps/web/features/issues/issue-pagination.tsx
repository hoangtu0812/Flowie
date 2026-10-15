'use client';

import { HStack } from '@astryxdesign/core/Layout';
import { Button } from '@/components/ui/button';
import { useIssuesStore } from '@/store/issues-store';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';
import { IssueListCount } from './issue-list-count';

/** Pagination only occupies space when there are more rows or a recoverable page error. */
export function IssuePagination() {
   const { page, loading, loadingMore, loadMore, pageError } = useIssuesStore();
   const tx = useMessages(messages);
   if (loading || !page || (!page.nextCursor && !pageError)) return null;
   return (
      <HStack
         as="footer"
         gap={3}
         justify="between"
         wrap="wrap"
         className="shrink-0 border-t px-6 py-2"
      >
         <IssueListCount />
         {pageError && (
            <p className="text-xs text-destructive" role="alert">
               {pageError}
            </p>
         )}
         {page.nextCursor && (
            <Button
               size="xs"
               variant="ghost"
               disabled={loadingMore}
               onClick={() => void loadMore()}
            >
               {loadingMore
                  ? tx('Loading more issues…')
                  : pageError
                    ? tx('Retry more issues')
                    : tx('Load more issues')}
            </Button>
         )}
      </HStack>
   );
}
