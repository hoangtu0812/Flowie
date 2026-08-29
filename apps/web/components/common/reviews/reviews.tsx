'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
   CodeReview,
   linkReviewIssue,
   loadReview,
   loadReviews,
   markReviewViewed,
   ReviewState,
   ScmProvider,
   unlinkReviewIssue,
} from '@/lib/scm';
import { cn } from '@/lib/utils';
import { loadCurrentWorkspace } from '@/lib/workspaces';
import { formatDistanceToNow } from 'date-fns';
import {
   ArrowUpRight,
   CheckCircle2,
   CircleDot,
   GitPullRequest,
   Link2,
   Loader2,
   Search,
   Unlink,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type ReviewListTab = 'assigned' | 'created';

const STATE_LABELS: Record<ReviewState, string> = {
   OPEN: 'Open',
   MERGED: 'Merged',
   CLOSED: 'Closed',
   ABANDONED: 'Abandoned',
};

function ProviderBadge({ provider }: { provider: ScmProvider }) {
   return (
      <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">
         {provider === 'GITHUB' ? 'GitHub' : 'Azure DevOps'}
      </Badge>
   );
}

function ReviewStateIcon({ state }: { state: ReviewState }) {
   if (state === 'MERGED') return <CheckCircle2 className="size-4 text-violet-500" />;
   if (state === 'OPEN') return <GitPullRequest className="size-4 text-emerald-500" />;
   return <CircleDot className="size-4 text-muted-foreground" />;
}

function ReviewRow({
   review,
   orgId,
   selected,
}: {
   review: CodeReview;
   orgId: string;
   selected: boolean;
}) {
   return (
      <Link
         href={`/${orgId}/review/${review.id}`}
         className={cn(
            'block border-b border-border/50 px-4 py-3 transition-colors',
            selected ? 'bg-accent/70' : 'hover:bg-accent/35'
         )}
      >
         <div className="flex items-start gap-2">
            <ReviewStateIcon state={review.state} />
            <div className="min-w-0 flex-1">
               <div className="flex items-center gap-1.5">
                  {review.unread && (
                     <span className="size-1.5 rounded-full bg-primary" aria-label="Unread" />
                  )}
                  <span className="truncate text-sm font-medium">{review.title}</span>
               </div>
               <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <ProviderBadge provider={review.provider} />
                  <span className="truncate">{review.repositoryName}</span>
                  {review.number && <span>#{review.number}</span>}
                  <span className="ml-auto shrink-0">
                     {formatDistanceToNow(new Date(review.externalUpdatedAt), { addSuffix: true })}
                  </span>
               </div>
            </div>
         </div>
      </Link>
   );
}

function ReviewDetail({
   workspaceId,
   review,
   onChanged,
}: {
   workspaceId: string;
   review: CodeReview;
   onChanged: (review: CodeReview) => void;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const [issueIdentifier, setIssueIdentifier] = useState('');
   const [message, setMessage] = useState<string>();
   const [saving, setSaving] = useState(false);

   async function linkIssue(event: FormEvent) {
      event.preventDefault();
      if (!issueIdentifier.trim()) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const link = await linkReviewIssue(workspaceId, review.id, issueIdentifier);
         onChanged({ ...review, issueLinks: [...review.issueLinks, link] });
         setIssueIdentifier('');
      } catch (error) {
         setMessage(error instanceof Error ? error.message : 'Could not link the Issue.');
      } finally {
         setSaving(false);
      }
   }

   async function unlink(issueId: string) {
      setSaving(true);
      setMessage(undefined);
      try {
         await unlinkReviewIssue(workspaceId, review.id, issueId);
         onChanged({
            ...review,
            issueLinks: review.issueLinks.filter((link) => link.issueId !== issueId),
         });
      } catch (error) {
         setMessage(error instanceof Error ? error.message : 'Could not unlink the Issue.');
      } finally {
         setSaving(false);
      }
   }

   return (
      <div className="h-full overflow-y-auto">
         <div className="border-b px-6 py-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
               <ProviderBadge provider={review.provider} />
               <span>{review.repositoryName}</span>
               {review.number && <span>#{review.number}</span>}
               {review.isDraft && <Badge variant="secondary">Draft</Badge>}
            </div>
            <div className="mt-2 flex items-start gap-3">
               <ReviewStateIcon state={review.state} />
               <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-semibold leading-6">{review.title}</h1>
                  <p className="mt-1 text-xs text-muted-foreground">
                     {review.authorName ?? 'Unknown author'} wants to merge{' '}
                     <code>{review.sourceRef.replace('refs/heads/', '')}</code> into{' '}
                     <code>{review.targetRef.replace('refs/heads/', '')}</code>
                  </p>
               </div>
               <Button asChild size="sm">
                  <a href={review.remoteUrl} target="_blank" rel="noreferrer">
                     Open in {review.provider === 'GITHUB' ? 'GitHub' : 'Azure DevOps'}
                     <ArrowUpRight className="size-3.5" />
                  </a>
               </Button>
            </div>
         </div>

         <div className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-6">
               <section className="rounded-lg border bg-container p-4">
                  <h2 className="text-sm font-medium">Overview</h2>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                     {review.description || 'No description was provided by the author.'}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3 text-xs text-muted-foreground">
                     {review.changedFiles !== null && (
                        <span>{review.changedFiles} files changed</span>
                     )}
                     {review.additions !== null && (
                        <span className="text-emerald-600">+{review.additions}</span>
                     )}
                     {review.deletions !== null && (
                        <span className="text-red-500">−{review.deletions}</span>
                     )}
                     <span>{review.revisions?.length ?? 1} revision(s)</span>
                  </div>
               </section>

               <section className="rounded-lg border bg-container p-4">
                  <h2 className="text-sm font-medium">Reviewers</h2>
                  <div className="mt-3 space-y-2">
                     {review.reviewers.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                           No reviewers are currently assigned.
                        </p>
                     )}
                     {review.reviewers.map((reviewer) => (
                        <div
                           key={reviewer.externalUserId}
                           className="flex items-center gap-2 text-sm"
                        >
                           <span className="min-w-0 flex-1 truncate">
                              {reviewer.displayName ?? reviewer.externalUserId}
                              {reviewer.isRequired && (
                                 <span className="ml-1 text-xs text-muted-foreground">
                                    required
                                 </span>
                              )}
                           </span>
                           <Badge
                              variant={reviewer.decision === 'APPROVED' ? 'secondary' : 'outline'}
                           >
                              {reviewer.decision.replaceAll('_', ' ').toLowerCase()}
                           </Badge>
                        </div>
                     ))}
                  </div>
               </section>
            </div>

            <aside className="space-y-4">
               <section className="rounded-lg border bg-container p-4">
                  <div className="flex items-center gap-2">
                     <Link2 className="size-4" />
                     <h2 className="text-sm font-medium">Linked Issues</h2>
                  </div>
                  <div className="mt-3 space-y-2">
                     {review.issueLinks.map((link) => (
                        <div
                           key={link.issueId}
                           className="flex items-center gap-2 rounded-md border px-2 py-1.5"
                        >
                           <Link
                              href={`/${orgId}/issue/${link.identifier}`}
                              className="min-w-0 flex-1 text-xs hover:underline"
                           >
                              <span className="font-medium">{link.identifier}</span>
                              <span className="ml-1 text-muted-foreground">{link.title}</span>
                           </Link>
                           <button
                              type="button"
                              onClick={() => void unlink(link.issueId)}
                              disabled={saving}
                              aria-label={`Unlink ${link.identifier}`}
                           >
                              <Unlink className="size-3.5 text-muted-foreground" />
                           </button>
                        </div>
                     ))}
                     {review.issueLinks.length === 0 && (
                        <p className="text-xs text-muted-foreground">No Issue linked yet.</p>
                     )}
                  </div>
                  <form onSubmit={linkIssue} className="mt-3 flex gap-2">
                     <Input
                        value={issueIdentifier}
                        onChange={(event) => setIssueIdentifier(event.target.value)}
                        placeholder="Issue key, e.g. GEN-123"
                        className="h-8 text-xs"
                     />
                     <Button size="xs" disabled={saving || !issueIdentifier.trim()}>
                        Link
                     </Button>
                  </form>
                  {message && <p className="mt-2 text-xs text-destructive">{message}</p>}
               </section>

               <section className="rounded-lg border bg-container p-4 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">Read-only provider mode</p>
                  <p className="mt-1">
                     Comments, decisions, diffs, and merge actions remain in the provider until
                     write permissions are enabled.
                  </p>
               </section>
            </aside>
         </div>
      </div>
   );
}

export default function Reviews({
   listTab = 'assigned',
   selectedReviewId,
}: {
   listTab?: ReviewListTab;
   selectedReviewId?: string;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [reviews, setReviews] = useState<CodeReview[]>([]);
   const [selected, setSelected] = useState<CodeReview>();
   const [provider, setProvider] = useState<'ALL' | ScmProvider>('ALL');
   const [search, setSearch] = useState('');
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setError(undefined);
      void loadCurrentWorkspace(orgId)
         .then(async (workspace) => {
            const records = await loadReviews(workspace.id, {
               view: listTab,
               provider: provider === 'ALL' ? undefined : provider,
               search,
            });
            if (!cancelled) {
               setWorkspaceId(workspace.id);
               setReviews(records);
            }
         })
         .catch((reason) => {
            if (!cancelled)
               setError(reason instanceof Error ? reason.message : 'Could not load reviews.');
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });
      return () => {
         cancelled = true;
      };
   }, [listTab, orgId, provider, search]);

   useEffect(() => {
      if (!workspaceId || !selectedReviewId) {
         setSelected(undefined);
         return;
      }
      let cancelled = false;
      setSelected(undefined);
      void loadReview(workspaceId, selectedReviewId)
         .then((record) => {
            if (cancelled) return;
            setSelected(record);
            if (record.unread) {
               void markReviewViewed(workspaceId, record.id)
                  .then(() => {
                     if (cancelled) return;
                     setReviews((items) =>
                        items.map((item) =>
                           item.id === record.id ? { ...item, unread: false } : item
                        )
                     );
                     setSelected((current) => (current ? { ...current, unread: false } : current));
                  })
                  .catch(() => undefined);
            }
         })
         .catch((reason) => {
            if (!cancelled)
               setError(reason instanceof Error ? reason.message : 'Could not load this review.');
         });
      return () => {
         cancelled = true;
      };
   }, [selectedReviewId, workspaceId]);

   const groups = useMemo(
      () =>
         (['OPEN', 'MERGED', 'CLOSED', 'ABANDONED'] as ReviewState[])
            .map((state) => ({ state, items: reviews.filter((review) => review.state === state) }))
            .filter((group) => group.items.length > 0),
      [reviews]
   );

   return (
      <div className="flex h-full w-full overflow-hidden">
         <div className="flex h-full w-[430px] max-w-[46%] shrink-0 flex-col border-r bg-container">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
               <SidebarTrigger />
               <span className="text-sm font-medium">Reviews</span>
               <span className="ml-auto text-xs text-muted-foreground">{reviews.length}</span>
            </div>
            <div className="space-y-2 border-b px-4 py-3">
               <div className="flex flex-wrap gap-1.5">
                  <Button
                     asChild
                     size="xs"
                     variant={listTab === 'assigned' ? 'secondary' : 'ghost'}
                  >
                     <Link href={`/${orgId}/reviews`}>For you</Link>
                  </Button>
                  <Button asChild size="xs" variant={listTab === 'created' ? 'secondary' : 'ghost'}>
                     <Link href={`/${orgId}/reviews/created`}>Created</Link>
                  </Button>
                  {(['ALL', 'GITHUB', 'AZURE_DEVOPS'] as const).map((value) => (
                     <Button
                        key={value}
                        type="button"
                        size="xs"
                        variant={provider === value ? 'outline' : 'ghost'}
                        onClick={() => setProvider(value)}
                     >
                        {value === 'ALL' ? 'All' : value === 'GITHUB' ? 'GitHub' : 'Azure'}
                     </Button>
                  ))}
               </div>
               <div className="relative">
                  <Search className="absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                  <Input
                     value={search}
                     onChange={(event) => setSearch(event.target.value)}
                     placeholder="Search title, author, or repository"
                     className="h-8 pl-8 text-xs"
                  />
               </div>
            </div>
            <div className="flex-1 overflow-y-auto">
               {loading && (
                  <div className="flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                     <Loader2 className="size-4 animate-spin" /> Loading reviews…
                  </div>
               )}
               {!loading && error && <p className="p-5 text-sm text-destructive">{error}</p>}
               {!loading && !error && groups.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">
                     No reviews match this view. Enable a mapped repository in Code &amp; reviews
                     settings, then sync it.
                  </div>
               )}
               {groups.map((group) => (
                  <section key={group.state}>
                     <div className="sticky top-0 flex items-center bg-muted/60 px-4 py-1.5 text-xs font-medium backdrop-blur">
                        {STATE_LABELS[group.state]}
                        <span className="ml-auto text-muted-foreground">{group.items.length}</span>
                     </div>
                     {group.items.map((review) => (
                        <ReviewRow
                           key={review.id}
                           review={review}
                           orgId={orgId}
                           selected={review.id === selectedReviewId}
                        />
                     ))}
                  </section>
               ))}
            </div>
         </div>

         <div className="h-full min-w-0 flex-1 overflow-hidden">
            {selected && workspaceId ? (
               <ReviewDetail
                  workspaceId={workspaceId}
                  review={selected}
                  onChanged={(record) => {
                     setSelected(record);
                     setReviews((items) =>
                        items.map((item) => (item.id === record.id ? record : item))
                     );
                  }}
               />
            ) : (
               <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {selectedReviewId ? 'Loading review…' : 'Select a review to see its details.'}
               </div>
            )}
         </div>
      </div>
   );
}
