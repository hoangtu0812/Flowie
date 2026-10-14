'use client';
import { useLocale } from '@/features/shared/use-locale';

import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { DesignSurface } from '@/components/common/design-surface';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { CommentRow } from '@/features/issues/comment-row';
import { CommentMentions } from '@/features/issues/comment-mentions';
import { useIssueActivity } from '@/features/issues/use-issue-activity';
import { useIssuesStore } from '@/store/issues-store';
import { useImagePaste } from '@/hooks/use-image-paste';
import { ActivityItem } from '@/mock-data/issue-details';
import { User } from '@/mock-data/users';
import {
   Ban,
   CircleDot,
   GitPullRequestArrow,
   Link2,
   PenLine,
   RefreshCcw,
   Tag,
   Unlock,
} from 'lucide-react';
import { ReactNode } from 'react';
import { relativeTime } from '@/lib/time';

type Actor = { id: string; name: string; avatarUrl?: string | null } | null;
type NativeActivity = {
   id: string;
   type: string;
   data?: Record<string, unknown>;
   createdAt: string;
   actor: Actor;
};
const EVENT_ICONS: Record<string, ReactNode> = {
   created: <PenLine className="size-3.5" />,
   status: <CircleDot className="size-3.5" />,
   label: <Tag className="size-3.5" />,
   priority: <CircleDot className="size-3.5" />,
   cycle: <RefreshCcw className="size-3.5" />,
   blocked: <Ban className="size-3.5" />,
   unblocked: <Unlock className="size-3.5" />,
   related: <Link2 className="size-3.5" />,
   pr: <GitPullRequestArrow className="size-3.5" />,
};

const asUser = (actor: Actor): User => ({
   id: actor?.id ?? 'system',
   name: actor?.name ?? 'Flowie',
   avatarUrl: actor?.avatarUrl ?? '',
   email: '',
   status: 'offline',
   role: 'Member',
   joinedDate: '',
   teamIds: [],
   timezone: 'UTC',
});

const timeAgo = relativeTime;

const eventText = (type: string) => {
   const [, action = type] = type.split('.', 2);
   return action.replaceAll('_', ' ');
};

const activityItem = (activity: NativeActivity): ActivityItem => ({
   kind: 'event',
   id: activity.id,
   actor: asUser(activity.actor),
   event: activity.type.split('.', 1)[0] === 'issue' ? eventText(activity.type) : activity.type,
   text: eventText(activity.type),
   timeAgo: timeAgo(activity.createdAt),
});

function EventRow({ item }: { item: Extract<ActivityItem, { kind: 'event' }> }) {
   return (
      <HStack gap={2} paddingBlock={2}>
         {EVENT_ICONS[item.event] ?? <CircleDot aria-hidden="true" />}
         <Text>
            <Text weight="medium">{item.actor.name}</Text> {item.text}
         </Text>
         <Text type="supporting">{item.timeAgo}</Text>
      </HStack>
   );
}

export function ActivityFeed({ issueId }: { issueId: string }) {
   const { t } = useLocale();
   const state = useIssueActivity(issueId);
   const submitMode = useUiPreferencesStore((store) => store.commentSubmitMode);
   const { onPaste, uploading } = useImagePaste({
      workspaceId: state.workspaceId,
      entityType: 'issue',
      entityId: issueId,
      value: state.draft,
      onChange: state.setDraft,
   });
   const issue = useIssuesStore((store) =>
      store.issues.find((candidate) => candidate.id === issueId)
   );
   const updateSubscription = useIssuesStore((store) => store.updateIssueSubscription);
   const items = state.activities.map(activityItem);
   return (
      <DesignSurface>
         <VStack
            gap={4}
            paddingBlock={4}
            onKeyDown={(event) => {
               if (
                  event.target instanceof HTMLElement &&
                  Boolean(event.target.closest('[data-comment-composer]')) &&
                  !event.nativeEvent.isComposing &&
                  event.key === 'Enter' &&
                  (submitMode === 'enter' ? !event.shiftKey : event.ctrlKey || event.metaKey) &&
                  !uploading &&
                  !state.sending
               ) {
                  event.preventDefault();
                  void state.submit();
               }
            }}
         >
            <HStack justify="between" gap={2}>
               <Heading level={2}>{t('activity')}</Heading>
               <Button
                  label={issue?.isSubscribed ? t('unsubscribe') : t('subscribe')}
                  size="sm"
                  variant="ghost"
                  isDisabled={!issue}
                  clickAction={async () => {
                     if (issue) await updateSubscription(issue.id, !issue.isSubscribed);
                  }}
               />
            </HStack>
            {state.loading && <Text role="status">{t('loadingActivity')}</Text>}
            {state.error && (
               <VStack gap={2}>
                  <Text role="alert">{state.error}</Text>
                  <Button label={t('retryActivity')} onClick={state.retry} />
               </VStack>
            )}
            {items.map((item) => (
               <EventRow key={item.id} item={item as Extract<ActivityItem, { kind: 'event' }>} />
            ))}
            {state.activityCursor && (
               <Button
                  label={t('olderActivity')}
                  isLoading={state.paging}
                  clickAction={() => state.loadMore('activities')}
               />
            )}
            {state.workspaceId &&
               state.comments
                  .filter(
                     (comment) =>
                        !comment.parentCommentId ||
                        !state.comments.some((parent) => parent.id === comment.parentCommentId)
                  )
                  .map((comment) => (
                     <VStack key={comment.id} gap={2}>
                        {comment.parentCommentId && (
                           <Text type="supporting">{t('deletedCommentReply')}</Text>
                        )}
                        <CommentRow
                           comment={comment}
                           workspaceId={state.workspaceId!}
                           onChange={state.changeComment}
                           onDelete={() => state.deleteComment(comment.id)}
                           onReply={() => state.setReplyTo(comment)}
                        />
                        {state.comments
                           .filter((reply) => reply.parentCommentId === comment.id)
                           .map((reply) => (
                              <VStack key={reply.id} paddingInlineStart={4}>
                                 <CommentRow
                                    comment={reply}
                                    workspaceId={state.workspaceId!}
                                    onChange={state.changeComment}
                                    onDelete={() => state.deleteComment(reply.id)}
                                    onReply={() => state.setReplyTo(comment)}
                                 />
                              </VStack>
                           ))}
                        {(comment.replyCount ?? 0) >
                           state.comments.filter((item) => item.parentCommentId === comment.id)
                              .length && (
                           <Button
                              label={`${t('moreReplies')} ${comment.author.name}`}
                              isLoading={state.paging}
                              clickAction={() => state.loadMore('comments', comment.id)}
                           />
                        )}
                     </VStack>
                  ))}
            {state.commentCursor && (
               <Button
                  label={t('olderComments')}
                  isLoading={state.paging}
                  clickAction={() => state.loadMore('comments')}
               />
            )}
            {state.replyTo && (
               <HStack gap={2}>
                  <Text>
                     {t('replyingTo')} {state.replyTo.author.name}
                  </Text>
                  <Button label={t('cancelReply')} onClick={() => state.setReplyTo(undefined)} />
               </HStack>
            )}
            {state.workspaceId && (
               <CommentMentions
                  workspaceId={state.workspaceId}
                  issueId={issueId}
                  selected={state.mentionIds}
                  onChange={state.setMentionIds}
                  disabled={state.sending}
               />
            )}
            <VStack data-comment-composer gap={2}>
               <TextArea
                  label={t('comment')}
                  value={state.draft}
                  onChange={state.setDraft}
                  onPaste={onPaste}
                  rows={3}
                  placeholder={t('commentPlaceholder')}
                  isDisabled={state.sending || !state.workspaceId}
               />
               {state.submitError && <Text role="alert">{state.submitError}</Text>}
               <HStack justify="between" gap={2}>
                  <Text type="supporting">
                     {uploading ? t('uploadingImage') : t('pasteScreenshot')}
                  </Text>
                  <Button
                     label={t('comment')}
                     size="sm"
                     variant="primary"
                     clickAction={state.submit}
                     isLoading={state.sending}
                     isDisabled={!state.draft.trim() || !state.workspaceId || uploading}
                  />
               </HStack>
            </VStack>
         </VStack>
      </DesignSurface>
   );
}
