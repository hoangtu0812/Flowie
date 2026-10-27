'use client';

import { useMessages } from '@/features/shared/use-messages';
import { useLocale } from '@/features/shared/use-locale';
import { messages } from '@/features/issues/messages.vi';
import { Button } from '@astryxdesign/core/Button';
import { loadReviews, type CodeReview, type ReviewReviewer } from '@/lib/scm';
import { relativeTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { useIssuesStore } from '@/store/issues-store';
import {
   ArrowUpRight,
   Check,
   Clock3,
   FileDiff,
   GitBranch,
   GitCommitHorizontal,
   GitMerge,
   GitPullRequest,
   GitPullRequestClosed,
   GitPullRequestDraft,
   MessageSquare,
   X,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Squares in the GitHub-style diff bar; each one stands for a fifth of the changed lines.
 * VI: Số ô trong thanh diff kiểu GitHub; mỗi ô tương ứng một phần năm số dòng thay đổi.
 */
const DIFF_SQUARES = 5;

function PullRequestStateIcon({ review }: { review: CodeReview }) {
   const className = 'size-4 shrink-0';
   if (review.state === 'MERGED') return <GitMerge className={cn(className, 'text-violet-500')} />;
   if (review.state !== 'OPEN')
      return <GitPullRequestClosed className={cn(className, 'text-red-500')} />;
   if (review.isDraft)
      return <GitPullRequestDraft className={cn(className, 'text-muted-foreground')} />;
   return <GitPullRequest className={cn(className, 'text-emerald-500')} />;
}

/**
 * Renders added and deleted line counts with a five-square bar in GitHub's style. The bar is
 * proportional to the add/delete ratio. Callers render it only when the provider reported both
 * counts, so a missing value never shows as a misleading zero.
 * VI: Hiển thị số dòng thêm/xoá kèm thanh 5 ô theo kiểu GitHub. Thanh tỉ lệ theo số dòng
 * VI: thêm/xoá. Component cha chỉ hiển thị khi provider trả về đủ hai số liệu, để giá trị
 * VI: bị thiếu không hiện thành số 0 sai lệch.
 */
function DiffStat({ additions, deletions }: { additions: number; deletions: number }) {
   const total = additions + deletions;
   const added = total ? Math.round((additions / total) * DIFF_SQUARES) : 0;
   const deleted = total
      ? Math.min(DIFF_SQUARES - added, Math.round((deletions / total) * DIFF_SQUARES))
      : 0;
   return (
      <span className="inline-flex items-center gap-1.5 font-mono tabular-nums">
         <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
         <span className="text-red-600 dark:text-red-400">−{deletions}</span>
         <span className="inline-flex gap-px" aria-hidden="true">
            {Array.from({ length: DIFF_SQUARES }, (_, index) => (
               <span
                  key={index}
                  className={cn(
                     'size-2 rounded-[2px]',
                     index < added
                        ? 'bg-emerald-500'
                        : index < added + deleted
                          ? 'bg-red-500'
                          : 'bg-muted-foreground/25'
                  )}
               />
            ))}
         </span>
      </span>
   );
}

function ReviewerChip({ reviewer }: { reviewer: ReviewReviewer }) {
   const tx = useMessages(messages);
   const name = reviewer.displayName ?? reviewer.externalUserId;
   const approved = reviewer.decision.startsWith('APPROVED');
   const blocked = ['CHANGES_REQUESTED', 'REJECTED', 'WAITING_FOR_AUTHOR'].includes(
      reviewer.decision
   );
   const commented = reviewer.decision === 'COMMENTED';
   const Icon = approved ? Check : blocked ? X : commented ? MessageSquare : Clock3;
   const decision = approved
      ? tx('Approved')
      : blocked
        ? tx('Changes requested')
        : commented
          ? tx('Commented')
          : tx('Review pending');
   return (
      <span
         className="relative inline-flex size-6 items-center justify-center rounded-full border border-border bg-muted text-[10px] font-medium uppercase"
         title={`${name} · ${decision}`}
         aria-label={`${name}: ${decision}`}
      >
         {name.slice(0, 1)}
         <span
            className={cn(
               'absolute -right-1 -bottom-1 inline-flex size-3.5 items-center justify-center rounded-full ring-2 ring-background',
               approved
                  ? 'bg-emerald-500 text-white'
                  : blocked
                    ? 'bg-red-500 text-white'
                    : 'bg-muted-foreground/30 text-foreground'
            )}
         >
            <Icon className="size-2.5" strokeWidth={3} aria-hidden="true" />
         </span>
      </span>
   );
}

function PullRequestCard({ review, orgId }: { review: CodeReview; orgId: string }) {
   const tx = useMessages(messages);
   const { locale } = useLocale();
   const stateLabel =
      review.state === 'OPEN' && review.isDraft
         ? tx('Draft')
         : review.state === 'OPEN'
           ? tx('Open')
           : review.state === 'MERGED'
             ? tx('Merged')
             : tx('Closed');
   return (
      <div className="flex flex-col gap-2 rounded-lg border border-border/70 bg-container p-3 transition-colors hover:border-border">
         <div className="flex min-w-0 items-start gap-2">
            <span className="mt-0.5" title={stateLabel} aria-label={stateLabel} role="img">
               <PullRequestStateIcon review={review} />
            </span>
            <Link
               href={`/${orgId}/review/${review.id}`}
               className="min-w-0 flex-1 text-sm font-medium leading-snug hover:underline"
            >
               {review.title}
               {review.number !== null && (
                  <span className="ml-1.5 font-normal text-muted-foreground">#{review.number}</span>
               )}
            </Link>
            <Button
               label={tx('Open on provider')}
               tooltip={
                  review.provider === 'GITHUB' ? tx('Open on GitHub') : tx('Open on Azure DevOps')
               }
               icon={<ArrowUpRight className="size-4" />}
               isIconOnly
               size="sm"
               variant="ghost"
               href={review.remoteUrl}
               target="_blank"
            />
         </div>
         <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pl-6 text-xs text-muted-foreground">
            <span className="truncate">{review.repositoryName}</span>
            <span
               className="inline-flex min-w-0 items-center gap-1"
               title={`${review.sourceRef} → ${review.targetRef}`}
            >
               <GitBranch className="size-3.5 shrink-0" aria-hidden="true" />
               <code className="truncate rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground/80">
                  {review.sourceRef}
               </code>
               <span aria-hidden="true">→</span>
               <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground/80">
                  {review.targetRef}
               </code>
            </span>
            {review.headRevision && (
               <span className="inline-flex items-center gap-1" title={review.headRevision}>
                  <GitCommitHorizontal className="size-3.5" aria-hidden="true" />
                  <code className="font-mono text-[11px]">{review.headRevision.slice(0, 7)}</code>
               </span>
            )}
            {review.additions !== null && review.deletions !== null && (
               <DiffStat additions={review.additions} deletions={review.deletions} />
            )}
            {review.changedFiles !== null && (
               <span className="inline-flex items-center gap-1">
                  <FileDiff className="size-3.5" aria-hidden="true" />
                  {tx('{count} files', { count: review.changedFiles })}
               </span>
            )}
         </div>
         <div className="flex items-center gap-2 pl-6 text-xs text-muted-foreground">
            {review.reviewers.length > 0 && (
               <span className="flex items-center gap-1.5">
                  {review.reviewers.map((reviewer) => (
                     <ReviewerChip key={reviewer.externalUserId} reviewer={reviewer} />
                  ))}
               </span>
            )}
            <span className="ml-auto shrink-0">
               {review.authorName && `${review.authorName} · `}
               {relativeTime(review.mergedAt ?? review.externalUpdatedAt, Date.now(), locale)}
            </span>
         </div>
      </div>
   );
}

/**
 * Lists pull requests linked to the issue (GitHub/Azure DevOps reviews synced by the SCM
 * integration) with state, branches, head commit and diff size. Hidden when none are linked
 * or the workspace has no SCM connection, so issues without code stay uncluttered.
 * VI: Liệt kê pull request liên kết với issue (review GitHub/Azure DevOps được đồng bộ qua
 * VI: tích hợp SCM) kèm trạng thái, branch, commit mới nhất và độ lớn diff. Ẩn khi không có
 * VI: PR liên kết hoặc workspace chưa kết nối SCM để issue không có code luôn gọn.
 */
export function IssuePullRequests({ issueId, orgId }: { issueId: string; orgId: string }) {
   const tx = useMessages(messages);
   const workspaceId = useIssuesStore((state) => state.workspaceId);
   const [reviews, setReviews] = useState<CodeReview[]>([]);

   useEffect(() => {
      if (!workspaceId) return;
      let current = true;
      void loadReviews(workspaceId, { view: 'all', issueId })
         .then((next) => current && setReviews(next))
         .catch(() => current && setReviews([]));
      return () => {
         current = false;
      };
   }, [workspaceId, issueId]);

   if (!reviews.length) return null;
   return (
      <section className="flex flex-col gap-2" aria-label={tx('Pull requests')}>
         <h3 className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <GitPullRequest className="size-3.5" aria-hidden="true" />
            {tx('Pull requests')}
            <span className="tabular-nums">{reviews.length}</span>
         </h3>
         {reviews.map((review) => (
            <PullRequestCard key={review.id} review={review} orgId={orgId} />
         ))}
      </section>
   );
}
