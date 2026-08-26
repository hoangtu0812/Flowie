'use client';

import { LoadingState } from '@/components/common/loading-state';
import { getIssueDetail } from '@/mock-data/issue-details';
import { useIssuesStore } from '@/store/issues-store';
import { Paperclip, Plus, SmilePlus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { AssigneeUser } from '../assignee-user';
import { ActivityFeed } from './activity-feed';
import { IssueDescription } from './issue-description';
import { IssuePropertiesPanel } from './issue-properties-panel';

/**
 * Issue detail page: rich description, sub-issues, activity feed and a
 * properties sidebar — Linear-style.
 */
export default function IssueDetails() {
   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const router = useRouter();
   const { issues, teams, loading, loadIssues } = useIssuesStore();

   // An issue URL can be opened without passing through a list first — a
   // refresh, an Inbox entry, a Discord link — so this screen has to fill the
   // store itself instead of assuming someone else already did.
   useEffect(() => {
      void loadIssues();
   }, [loadIssues]);

   const issue = useMemo(
      () => issues.find((candidate) => candidate.identifier === issueId),
      [issues, issueId]
   );

   const detail = useMemo(() => (issue ? getIssueDetail(issue) : null), [issue]);

   const team = teams.find((candidate) => candidate.id === issue?.teamId);
   const listHref = useRef(`/${orgId ?? 'lndev-ui'}/my-issues`);
   useEffect(() => {
      if (team) listHref.current = `/${orgId}/team/${team.identifier}/all`;
   }, [orgId, team]);

   // Deleting the issue drops it from the store. Leaving a "not found" page
   // behind reads as a failure, so return to the list it was opened from —
   // but only while the rest of the list is intact, otherwise a failed reload
   // would navigate away on its own.
   const seen = useRef(false);
   useEffect(() => {
      if (issue) {
         seen.current = true;
         return;
      }
      if (seen.current && issues.length > 0) router.replace(listHref.current);
   }, [issue, issues.length, router]);

   if (!issue || !detail) {
      if (loading) {
         return <LoadingState label="Loading issue…" />;
      }
      return (
         <div className="flex flex-col items-center justify-center h-full gap-2 text-sm text-muted-foreground">
            <p>Issue {issueId} not found.</p>
            <Link href={listHref.current} className="underline">
               Back to issues
            </Link>
         </div>
      );
   }

   const subIssues = (detail.subIssueIds ?? [])
      .map((identifier) => issues.find((candidate) => candidate.identifier === identifier))
      .filter((candidate) => candidate !== undefined);

   return (
      <div className="w-full h-full flex overflow-hidden">
         {/* Main column */}
         <div className="flex-1 min-w-0 h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10">
               <h1 className="text-3xl font-semibold leading-tight text-balance">{issue.title}</h1>

               <IssueDescription issue={issue} />

               {/* Quick actions */}
               <div className="flex items-center gap-3 mt-6 text-muted-foreground">
                  <button className="hover:text-foreground" aria-label="Add reaction">
                     <SmilePlus className="size-4" />
                  </button>
                  <button className="hover:text-foreground" aria-label="Attach file">
                     <Paperclip className="size-4" />
                  </button>
               </div>

               {/* Sub-issues */}
               <div className="mt-8">
                  {subIssues.length > 0 ? (
                     <>
                        <h2 className="text-sm font-medium mb-1">
                           Sub-issues{' '}
                           <span className="text-muted-foreground">
                              {
                                 subIssues.filter(
                                    (subIssue) => subIssue.status.category === 'completed'
                                 ).length
                              }
                              /{subIssues.length}
                           </span>
                        </h2>
                        <div className="flex flex-col border-t border-border/50">
                           {subIssues.map((subIssue) => (
                              <Link
                                 key={subIssue.id}
                                 href={`/${orgId ?? 'lndev-ui'}/issue/${subIssue.identifier}`}
                                 className="flex items-center gap-2.5 h-10 px-1 border-b border-border/50 hover:bg-sidebar/50 text-sm min-w-0"
                              >
                                 <subIssue.status.icon />
                                 <span className="text-muted-foreground shrink-0 text-xs font-medium">
                                    {subIssue.identifier}
                                 </span>
                                 <span className="truncate font-medium">{subIssue.title}</span>
                                 <span className="ml-auto shrink-0">
                                    <AssigneeUser user={subIssue.assignee} />
                                 </span>
                              </Link>
                           ))}
                        </div>
                     </>
                  ) : (
                     <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                        <Plus className="size-4" />
                        Add sub-issues
                     </button>
                  )}
               </div>

               <div className="border-t border-border/60 mt-8" />

               <ActivityFeed issueId={issue.id} />
            </div>
         </div>

         {/* Properties sidebar */}
         <aside className="hidden lg:block w-80 shrink-0 border-l h-full overflow-y-auto bg-container px-5 py-6">
            <IssuePropertiesPanel issue={issue} detail={detail} />
         </aside>
      </div>
   );
}
