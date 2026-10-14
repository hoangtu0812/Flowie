'use client';

import { BugDetails } from '@/features/issues/bug-details';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import type { IssueDetail } from '@/mock-data/issue-details';
import { DesignSurface } from '@/components/common/design-surface';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { IssueReactions } from './issue-reactions';
import { IssueRelations } from './issue-relations';
import { IssueAttachments } from './issue-attachments';
import { MobileIssueProperties } from './mobile-issue-properties';
import { useIssuesStore } from '@/store/issues-store';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityFeed } from './activity-feed';
import { IssueDescription } from './issue-description';
import { IssueSubIssues } from './issue-sub-issues';
import { IssuePropertiesPanel } from './issue-properties-panel';

/**
 * Issue detail page: rich description, sub-issues, activity feed and a
 * properties sidebar — Linear-style.
 */
export default function IssueDetails() {
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
   const listHref = useRef(`/${orgId ?? ''}/my-issues`);
   useEffect(() => {
      if (team) listHref.current = `/${orgId}/team/${team.identifier}/all`;
   }, [orgId, team]);

   if (error)
      return (
         <QueryState
            title="Could not load issue"
            message={error}
            onRetry={() => loadIssue(issueId)}
         />
      );

   if (!issue || !detail) {
      if (loading || initialLoad) return <LoadingState label="Loading issue…" />;
      return (
         <DesignSurface>
            <VStack gap={3} padding={6}>
               <Heading level={1}>Issue unavailable</Heading>
               <Text>Issue {issueId} was not found or is outside your access.</Text>
               <Link href={listHref.current}>Back to issues</Link>
            </VStack>
         </DesignSurface>
      );
   }

   return (
      <DesignSurface>
         <HStack height="100%" gap={0} align="stretch">
            <VStack width="100%" isScrollable>
               <VStack maxWidth="90ch" padding={6} gap={4}>
                  <Heading level={1}>{issue.title}</Heading>
                  <MobileIssueProperties issue={issue} detail={detail} />
                  <IssueDescription issue={issue} />
                  <BugDetails issue={issue} />
                  <IssueReactions issueId={issue.id} />
                  <IssueAttachments issueId={issue.id} />
                  {issue.teamId && (
                     <IssueSubIssues issueId={issue.id} teamId={issue.teamId} orgId={orgId ?? ''} />
                  )}
                  <IssueRelations issueId={issue.id} orgId={orgId ?? ''} />
                  <ActivityFeed issueId={issue.id} />
               </VStack>
            </VStack>
            <VStack as="aside" width={320} isScrollable padding={5} className="hidden lg:flex">
               <IssuePropertiesPanel issue={issue} detail={detail} />
            </VStack>
         </HStack>
      </DesignSurface>
   );
}
