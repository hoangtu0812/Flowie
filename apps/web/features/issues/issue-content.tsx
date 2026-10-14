'use client';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading } from '@astryxdesign/core/Text';
import type { Issue } from '@/mock-data/issues';
import { BugDetails } from './bug-details';
import { ActivityFeed } from '@/components/common/issues/details/activity-feed';
import { IssueDescription } from '@/components/common/issues/details/issue-description';
import { IssueAttachments } from '@/components/common/issues/details/issue-attachments';
import { IssueReactions } from '@/components/common/issues/details/issue-reactions';
import { IssueSubIssues } from '@/components/common/issues/details/issue-sub-issues';
import { IssueRelations } from '@/components/common/issues/details/issue-relations';
import { IssuePropertiesPanel } from '@/components/common/issues/details/issue-properties-panel';
import { MobileIssueProperties } from '@/components/common/issues/details/mobile-issue-properties';

export function IssueContent({
   issue,
   orgId,
   compact = false,
}: {
   issue: Issue;
   orgId: string;
   compact?: boolean;
}) {
   const detail = { identifier: issue.identifier, description: [], activity: [] };
   return (
      <HStack height="100%" gap={0} align="stretch">
         <VStack width="100%" isScrollable>
            <VStack maxWidth="90ch" padding={6} gap={4}>
               <Heading level={compact ? 2 : 1}>{issue.title}</Heading>
               <MobileIssueProperties issue={issue} detail={detail} allScreens={compact} />
               <IssueDescription issue={issue} />
               <BugDetails issue={issue} />
               <IssueReactions issueId={issue.id} />
               <IssueAttachments issueId={issue.id} />
               {issue.teamId && (
                  <IssueSubIssues issueId={issue.id} teamId={issue.teamId} orgId={orgId} />
               )}
               <IssueRelations issueId={issue.id} orgId={orgId} />
               <ActivityFeed key={issue.id} issueId={issue.id} />
            </VStack>
         </VStack>
         {!compact && (
            <VStack as="aside" width={320} isScrollable padding={5} className="hidden lg:flex">
               <IssuePropertiesPanel issue={issue} detail={detail} />
            </VStack>
         )}
      </HStack>
   );
}
