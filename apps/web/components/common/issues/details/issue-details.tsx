'use client';

import { useIssuesStore } from '@/store/issues-store';
import { Paperclip, SmilePlus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { ActivityFeed } from './activity-feed';
import { IssuePropertiesPanel } from './issue-properties-panel';

/** Original issue-detail layout backed by the live Issues store and API data. */
export default function IssueDetails() {
   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const { issues, isLoading, error, loadIssues } = useIssuesStore();

   useEffect(() => {
      void loadIssues();
   }, [loadIssues]);

   const issue = useMemo(
      () => issues.find((candidate) => candidate.identifier === issueId),
      [issues, issueId]
   );

   if (isLoading) {
      return (
         <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Loading issue…
         </div>
      );
   }

   if (!issue) {
      return (
         <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <p>{error ? 'Could not load this issue.' : `Issue ${issueId} not found.`}</p>
            <Link href={`/${orgId ?? 'lndev-ui'}/teams`} className="underline">
               Back to issues
            </Link>
         </div>
      );
   }

   return (
      <div className="w-full h-full flex overflow-hidden">
         <div className="flex-1 min-w-0 h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10">
               <h1 className="text-3xl font-semibold leading-tight text-balance">{issue.title}</h1>

               <div className="mt-6">
                  {issue.description ? (
                     <p className="whitespace-pre-wrap text-sm leading-6">{issue.description}</p>
                  ) : (
                     <p className="text-sm text-muted-foreground">No description provided.</p>
                  )}
               </div>

               <div className="flex items-center gap-3 mt-6 text-muted-foreground">
                  <button
                     type="button"
                     disabled
                     title="Reactions are not available yet"
                     className="opacity-50 cursor-not-allowed"
                     aria-label="Reactions are not available yet"
                  >
                     <SmilePlus className="size-4" />
                  </button>
                  <button
                     type="button"
                     disabled
                     title="Issue attachments are not available in this layout yet"
                     className="opacity-50 cursor-not-allowed"
                     aria-label="Issue attachments are not available in this layout yet"
                  >
                     <Paperclip className="size-4" />
                  </button>
               </div>

               <div className="mt-8 text-sm text-muted-foreground">
                  Sub-issues are not available yet.
               </div>

               <div className="border-t border-border/60 mt-8" />

               <ActivityFeed issueId={issue.id} initialSubscribed={Boolean(issue.isSubscribed)} />
            </div>
         </div>

         <aside className="hidden lg:block w-80 shrink-0 border-l h-full overflow-y-auto bg-container px-5 py-6">
            <IssuePropertiesPanel issue={issue} />
         </aside>
      </div>
   );
}
