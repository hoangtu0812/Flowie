'use client';

import { useIssuesStore } from '@/store/issues-store';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';

export function IssueListCount() {
   const { page, loading, issues } = useIssuesStore();
   const tx = useMessages(messages);
   return (
      <p
         className="text-xs text-muted-foreground truncate"
         title={tx('Insights cover all matching issues.')}
      >
         {loading || !page
            ? '…'
            : page.nextCursor
              ? tx('{loaded} of {total} issues loaded', {
                   loaded: issues.length,
                   total: page.total,
                })
              : tx('{total} issues', { total: page.total })}
      </p>
   );
}
