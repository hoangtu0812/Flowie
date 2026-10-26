'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { IssueContent } from '@/features/issues/issue-content';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import type { IssueDetail } from '@/mock-data/issue-details';
import { DesignSurface } from '@/components/common/design-surface';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useIssuesStore } from '@/store/issues-store';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * Issue detail page: rich description, sub-issues, activity feed and a
 * properties sidebar — Linear-style.
 */
export default function IssueDetails() {
   const tx = useMessages(messages);

   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const { issues, teams, loading, error, loadIssue } = useIssuesStore();

   const [initialLoad, setInitialLoad] = useState(true);

   // An issue URL can be opened without passing through a list first — a
   // refresh, an Inbox entry, a Discord link — so this screen has to fill the
   // store itself instead of assuming someone else already did.
   useEffect(() => {
      setInitialLoad(true);
      void loadIssue(issueId).finally(() => setInitialLoad(false));
   }, [loadIssue, orgId, issueId]);

   const issue = useMemo(
      () => issues.find((candidate) => candidate.identifier === issueId),
      [issues, issueId]
   );

   const detail = useMemo<IssueDetail | null>(
      () => (issue ? { identifier: issue.identifier, description: [], activity: [] } : null),
      [issue]
   );

   const team = teams.find((candidate) => candidate.id === issue?.teamId);
   const listHref = useRef(`/${orgId ?? ''}/issues`);
   useEffect(() => {
      if (team) listHref.current = `/${orgId}/team/${team.identifier}/all`;
   }, [orgId, team]);

   if (error)
      return (
         <QueryState
            title={tx('Could not load issue')}
            message={error}
            onRetry={() => loadIssue(issueId)}
         />
      );

   if (!issue || !detail) {
      if (loading || initialLoad) return <LoadingState label={tx('Loading issue…')} />;
      return (
         <DesignSurface>
            <VStack gap={3} padding={6}>
               <Heading level={1}>{tx('Issue unavailable')}</Heading>
               <Text>
                  {tx('Issue')} {issueId} {tx('was not found or is outside your access.')}
               </Text>
               <Link href={listHref.current}>{tx('Back to issues')}</Link>
            </VStack>
         </DesignSurface>
      );
   }

   return (
      <DesignSurface>
         <IssueContent issue={issue} orgId={orgId ?? ''} />
      </DesignSurface>
   );
}
