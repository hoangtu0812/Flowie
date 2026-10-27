'use client';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading } from '@astryxdesign/core/Text';
import type { Issue } from '@/mock-data/issues';
import { BugDetails } from './bug-details';
import { IssueAgentRun } from './issue-agent-run';
import { ActivityFeed } from '@/components/common/issues/details/activity-feed';
import { IssueDescription } from '@/components/common/issues/details/issue-description';
import { IssueAttachments } from '@/components/common/issues/details/issue-attachments';
import { IssueReactions } from '@/components/common/issues/details/issue-reactions';
import { IssueSubIssues } from '@/components/common/issues/details/issue-sub-issues';
import { IssuePropertiesPanel } from '@/components/common/issues/details/issue-properties-panel';
import { MobileIssueProperties } from '@/components/common/issues/details/mobile-issue-properties';
import { IssueSlaPanel } from '@/features/sla/issue-sla-panel';
import {
   IssuePullRequests,
   useIssueReviews,
} from '@/components/common/issues/details/issue-pull-requests';

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
   const reviews = useIssueReviews(issue.id);
   return (
      <HStack height="100%" gap={0} align="stretch" className="min-h-0 min-w-0 overflow-hidden">
         <VStack isScrollable className="min-h-0 min-w-0 flex-1" align="center">
            <VStack
               data-image-gallery
               width="100%"
               maxWidth={768}
               gap={6}
               className={compact ? 'px-5 py-6' : 'px-5 py-8 sm:px-8 sm:py-10'}
            >
               <Heading level={compact ? 2 : 1} textWrap="balance" className="break-words">
                  {issue.title}
               </Heading>
               <MobileIssueProperties
                  issue={issue}
                  detail={detail}
                  reviews={reviews}
                  allScreens={compact}
               />
               <IssueDescription issue={issue} />
               <BugDetails key={issue.id} issue={issue} />
               <IssueAgentRun key={issue.id} issueId={issue.id} />
               <IssuePullRequests reviews={reviews} orgId={orgId} />
               <IssueSlaPanel issue={issue} />
               <div className="flex flex-wrap items-center gap-2">
                  <IssueReactions issueId={issue.id} />
                  <IssueAttachments issueId={issue.id} />
               </div>
               <IssueSubIssues issueId={issue.id} teamId={issue.teamId} orgId={orgId} />
               <ActivityFeed key={issue.id} issueId={issue.id} />
            </VStack>
         </VStack>
         {!compact && (
            <VStack
               as="aside"
               width={304}
               isScrollable
               padding={5}
               className="hidden min-h-0 shrink-0 border-l border-border/60 bg-muted/10 lg:flex"
            >
               <IssuePropertiesPanel issue={issue} detail={detail} reviews={reviews} />
            </VStack>
         )}
      </HStack>
   );
}
