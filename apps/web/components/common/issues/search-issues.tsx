'use client';

import { useMemo } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { searchIssueCollection } from '@/features/issues/search';
import type { Issue } from '@/types/issues';
import { useSearchStore } from '@/store/search-store';
import { IssueLine } from './issue-line';
import { useIssuesStore } from '@/store/issues-store';
import { IssuePagination } from '@/features/issues/issue-pagination';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';

export function SearchIssues({ issues }: { issues: Issue[] }) {
   const { searchQuery, isSearchOpen } = useSearchStore();
   const { error, retryIssues, loading } = useIssuesStore();
   const results = useMemo(() => searchIssueCollection(issues, searchQuery), [issues, searchQuery]);
   if (!isSearchOpen || !searchQuery.trim()) return null;
   if (loading) return <LoadingState label="Searching issues…" />;
   if (error) return <QueryState message={error} onRetry={retryIssues} />;
   return (
      <DesignSurface>
         <IssuePagination />
         <VStack gap={2} paddingBlock={4}>
            <Heading level={2}>Results ({results.length})</Heading>
            {results.length ? (
               results.map((issue) => <IssueLine key={issue.id} issue={issue} layoutId={false} />)
            ) : (
               <Text>No results in this view for “{searchQuery}”.</Text>
            )}
         </VStack>
      </DesignSurface>
   );
}
