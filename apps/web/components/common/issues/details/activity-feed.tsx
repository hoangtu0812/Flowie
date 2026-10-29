'use client';
import { useLocale } from '@/features/shared/use-locale';

import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { CommentRow } from '@/features/issues/comment-row';
import { CommentMentions } from '@/features/issues/comment-mentions';
import { useIssueActivity } from '@/features/issues/use-issue-activity';
import { useIssuesStore } from '@/store/issues-store';
import { useImagePaste } from '@/hooks/use-image-paste';
import { DraftImages } from '@/components/common/markdown/draft-images';
import { AgentBadge } from '@/features/issues/agent-badge';
import { mentionOptions, type AgentIdentity } from '@/features/issues/comments-api';
import {
   ArrowUp,
   Ban,
   Bell,
   BellOff,
   CircleDot,
   GitPullRequestArrow,
   Link2,
   MessageSquare,
   PenLine,
   RefreshCcw,
   Tag,
   Unlock,
} from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { relativeTime } from '@/lib/time';

type Actor = { id: string; name: string; avatarUrl?: string | null } | null;
type ActivityChange = { field: string; change: string };
type NativeActivity = {
   id: string;
   type: string;
   data?: {
      changes?: ActivityChange[];
      fields?: string[];
      source?: string;
      agent?: AgentIdentity;
   } & Record<string, unknown>;
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
   updated: <PenLine className="size-3.5" />,
   comment_created: <MessageSquare className="size-3.5" />,
};

/**
 * Vietnamese names for the change labels the API stores in English (`issues.py`); values such
 * as status names are user data and stay as written.
 * VI: Tên tiếng Việt cho nhãn thay đổi mà API lưu bằng tiếng Anh (`issues.py`); giá trị như tên
 * VI: trạng thái là dữ liệu người dùng nên giữ nguyên.
 */
const FIELD_VI: Record<string, string> = {
   'Status': 'Trạng thái',
   'Assignee': 'Người thực hiện',
   'Title': 'Tiêu đề',
   'Priority': 'Độ ưu tiên',
   'Project': 'Dự án',
   'Start date': 'Ngày bắt đầu',
   'Target end date': 'Ngày kết thúc dự kiến',
   'Due date': 'Hạn chót',
   'Estimated effort': 'Công ước tính',
   'Actual effort': 'Công thực tế',
   'Description': 'Mô tả',
};

/**
 * Readable names for raw update fields, used for activities recorded before changes were
 * stored: "statusId" becomes "status", "labelIds" becomes "labels".
 * VI: Tên dễ đọc cho trường cập nhật thô, dùng cho hoạt động ghi trước khi lưu chi tiết thay
 * VI: đổi: "statusId" thành "status", "labelIds" thành "labels".
 */
const fieldName = (field: string) =>
   field
      .replace(/Ids$/, 's')
      .replace(/Id$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase();

const eventText = (type: string) => {
   const [, action = type] = type.split('.', 2);
   return action.replaceAll('_', ' ');
};

function EventRow({ activity }: { activity: NativeActivity }) {
   const { t, locale } = useLocale();
   const vi = locale === 'vi';
   const changes = activity.data?.changes ?? [];
   const fields = activity.data?.fields ?? [];
   const agent = activity.data?.source === 'AI' ? (activity.data.agent ?? {}) : undefined;
   const [scope, action = scope] = activity.type.split('.', 2);
   const text =
      activity.type === 'issue.created'
         ? t('activityCreated')
         : activity.type === 'comment.created'
           ? t('activityCommented')
           : activity.type === 'issue.updated'
             ? changes.length
                ? t('activityChanged')
                : fields.length
                  ? `${t('activityUpdated')} ${fields.map(fieldName).join(', ')}`
                  : t('activityUpdated')
             : eventText(activity.type);
   const icon = EVENT_ICONS[scope === 'issue' ? action : `${scope}_${action}`] ?? (
      <CircleDot className="size-3.5" />
   );
   return (
      <HStack gap={2} paddingBlock={1} align="start" className="text-muted-foreground">
         <HStack className="mt-1 shrink-0" aria-hidden="true">
            {icon}
         </HStack>
         <VStack gap={1} className="min-w-0 flex-1">
            <Text type="supporting">
               <Text weight="medium">{activity.actor?.name ?? 'Flowie'}</Text>{' '}
               {agent && (
                  <>
                     <AgentBadge agent={agent} />{' '}
                  </>
               )}
               {text}
               {' · '}
               {relativeTime(activity.createdAt, Date.now(), locale)}
            </Text>
            {changes.map((change) => (
               <Text key={change.field} type="supporting" className="break-words">
                  <Text weight="medium">
                     {vi ? (FIELD_VI[change.field] ?? change.field) : change.field}
                  </Text>
                  {': '}
                  {change.change === 'updated' ? t('activityUpdated') : change.change}
               </Text>
            ))}
         </VStack>
      </HStack>
   );
}

type ActivityState = ReturnType<typeof useIssueActivity>;

/**
 * Change history of an issue, newest first; older pages load at the bottom.
 * VI: Lịch sử thay đổi của công việc, mới nhất trước; trang cũ hơn tải ở cuối danh sách.
 */
export function ActivityEvents({ state }: { state: ActivityState }) {
   const { t } = useLocale();
   return (
      <VStack gap={2} className="min-w-0">
         {state.loading && <Text role="status">{t('loadingActivity')}</Text>}
         {state.error && (
            <VStack gap={2}>
               <Text role="alert">{state.error}</Text>
               <Button label={t('retryActivity')} onClick={state.retry} />
            </VStack>
         )}
         {[...state.activities].reverse().map((activity) => (
            <EventRow key={activity.id} activity={activity as NativeActivity} />
         ))}
         {state.activityCursor && (
            <Button
               label={t('olderActivity')}
               isLoading={state.paging}
               clickAction={() => state.loadMore('activities')}
            />
         )}
      </VStack>
   );
}

/**
 * Comments of an issue: the composer first, then top-level comments newest first so the
 * latest discussion is read without scrolling. Replies stay oldest first under their parent
 * so a thread reads in order. The feed state is owned by the parent, so switching tabs keeps
 * the draft and does not reload.
 * VI: Bình luận của công việc: ô nhập ở đầu, rồi bình luận gốc mới nhất trước để đọc trao đổi
 * VI: gần nhất mà không cần cuộn. Trả lời giữ thứ tự cũ → mới dưới bình luận gốc để đọc mạch
 * VI: lạc. State do component cha giữ, nên đổi tab không mất bản nháp và không tải lại.
 */
export function CommentsSection({ issueId, state }: { issueId: string; state: ActivityState }) {
   const { t } = useLocale();
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
   // Names of the members a comment can mention, loaded once per issue to highlight `@Name`.
   // shortcut: a mentioned member who later left the team is no longer highlighted; return
   // mention names with each comment from the API if that matters.
   // VI: Tên các thành viên có thể được mention, tải một lần cho mỗi issue để highlight `@Tên`.
   // VI: Thành viên đã rời team sau khi được mention sẽ không còn được highlight; nếu cần thì
   // VI: trả tên mention kèm mỗi comment từ API.
   const [memberNames, setMemberNames] = useState<Map<string, string>>();
   useEffect(() => {
      if (!state.workspaceId) return;
      let current = true;
      mentionOptions(state.workspaceId, issueId)
         .then((members) => {
            if (current) setMemberNames(new Map(members.map((member) => [member.id, member.name])));
         })
         .catch(() => undefined);
      return () => {
         current = false;
      };
   }, [state.workspaceId, issueId]);
   const disabled = state.sending || !state.workspaceId;
   const canSend = Boolean(state.draft.trim()) && Boolean(state.workspaceId) && !uploading;
   // The send button and the paste hint sit inside the composer frame, like a chat input.
   // VI: Nút gửi và dòng gợi ý dán ảnh nằm trong khung ô nhập, giống ô nhập chat.
   const composer = (
      <div className="rounded-lg border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
         <textarea
            aria-label={t('comment')}
            value={state.draft}
            onChange={(event) => state.setDraft(event.target.value)}
            onPaste={onPaste}
            rows={3}
            placeholder={t('commentPlaceholder')}
            disabled={disabled}
            className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
         />
         <HStack justify="between" vAlign="center" gap={2} className="px-3 pb-2">
            <Text type="supporting" size="sm">
               {uploading ? t('uploadingImage') : t('pasteScreenshot')}
            </Text>
            <Button
               label={t('sendComment')}
               tooltip={t('sendComment')}
               icon={<ArrowUp className="size-4" />}
               isIconOnly
               size="sm"
               variant="primary"
               clickAction={state.submit}
               isLoading={state.sending}
               isDisabled={!canSend}
            />
         </HStack>
      </div>
   );
   const roots = state.comments.filter(
      (comment) =>
         !comment.parentCommentId ||
         !state.comments.some((parent) => parent.id === comment.parentCommentId)
   );
   return (
      <DesignSurface>
         <VStack
            gap={4}
            paddingBlock={6}
            className="min-w-0 border-t border-border/60"
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
               <Heading level={4} accessibilityLevel={2}>
                  {t('comments')}
               </Heading>
               <Button
                  label={issue?.isSubscribed ? t('unsubscribe') : t('subscribe')}
                  tooltip={issue?.isSubscribed ? t('unsubscribe') : t('subscribe')}
                  icon={
                     issue?.isSubscribed ? (
                        <BellOff className="size-4" />
                     ) : (
                        <Bell className="size-4" />
                     )
                  }
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  isDisabled={!issue}
                  clickAction={async () => {
                     if (issue) await updateSubscription(issue.id, !issue.isSubscribed);
                  }}
               />
            </HStack>
            {state.replyTo && (
               <HStack gap={2}>
                  <Text>
                     {t('replyingTo')} {state.replyTo.author.name}
                  </Text>
                  <Button
                     label={t('cancelReply')}
                     size="sm"
                     variant="ghost"
                     onClick={() => state.setReplyTo(undefined)}
                  />
               </HStack>
            )}
            <VStack data-comment-composer gap={2}>
               {state.workspaceId ? (
                  <CommentMentions
                     workspaceId={state.workspaceId}
                     issueId={issueId}
                     selected={state.mentionIds}
                     onChange={state.setMentionIds}
                     draft={state.draft}
                     onDraftChange={state.setDraft}
                  >
                     {composer}
                  </CommentMentions>
               ) : (
                  composer
               )}
               <DraftImages
                  value={state.draft}
                  onChange={state.setDraft}
                  label={t('imagesInComment')}
                  removeLabel={t('removeImage')}
                  isDisabled={state.sending || uploading}
               />
               {state.submitError && <Text role="alert">{state.submitError}</Text>}
            </VStack>
            {state.workspaceId &&
               [...roots].reverse().map((comment) => (
                  <VStack key={comment.id} gap={2}>
                     {comment.parentCommentId && (
                        <Text type="supporting">{t('deletedCommentReply')}</Text>
                     )}
                     <CommentRow
                        comment={comment}
                        workspaceId={state.workspaceId!}
                        memberNames={memberNames}
                        onChange={state.changeComment}
                        onDelete={() => state.deleteComment(comment.id)}
                        onReply={() => state.setReplyTo(comment)}
                     />
                     {state.comments
                        .filter((reply) => reply.parentCommentId === comment.id)
                        .map((reply) => (
                           <VStack
                              key={reply.id}
                              paddingInlineStart={4}
                              className="border-l border-border/60"
                           >
                              <CommentRow
                                 comment={reply}
                                 workspaceId={state.workspaceId!}
                                 memberNames={memberNames}
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
         </VStack>
      </DesignSurface>
   );
}
