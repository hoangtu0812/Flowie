'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { DesignSurface } from '@/components/common/design-surface';
import { useIssueActivity } from '@/features/issues/use-issue-activity';
import { useIssuesStore } from '@/store/issues-store';
import { useImagePaste } from '@/hooks/use-image-paste';
import { ActivityItem, ContentBlock } from '@/mock-data/issue-details';
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
import { ContentBlocks } from './content-blocks';

type Actor = { id: string; name: string; avatarUrl?: string | null } | null;
type NativeActivity = {
   id: string;
   type: string;
   data?: Record<string, unknown>;
   createdAt: string;
   actor: Actor;
};
type NativeComment = {
   id: string;
   content: string;
   createdAt: string;
   author: NonNullable<Actor>;
   reactions: Array<{ emoji: string; count: number; reacted: boolean }>;
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

const timeAgo = (value: string) => {
   const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
   const minutes = Math.floor(elapsed / 60_000);
   if (minutes < 1) return 'just now';
   if (minutes < 60) return `${minutes}m ago`;
   const hours = Math.floor(minutes / 60);
   if (hours < 24) return `${hours}h ago`;
   return `${Math.floor(hours / 24)}d ago`;
};

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

const commentItem = (comment: NativeComment): ActivityItem => ({
   kind: 'comment',
   id: comment.id,
   actor: asUser(comment.author),
   timeAgo: timeAgo(comment.createdAt),
   body: [{ type: 'paragraph', text: comment.content }] as ContentBlock[],
   reactions: comment.reactions.map(({ emoji, count }) => ({ emoji, count })),
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

function CommentRow({ item }: { item: Extract<ActivityItem, { kind: 'comment' }> }) {
   return (
      <VStack gap={2} paddingBlock={3}>
         <HStack gap={2}>
            <Avatar>
               <AvatarImage src={item.actor.avatarUrl} alt={item.actor.name} />
               <AvatarFallback>{item.actor.name[0]}</AvatarFallback>
            </Avatar>
            <Text weight="medium">{item.actor.name}</Text>
            <Text type="supporting">{item.timeAgo}</Text>
         </HStack>
         <ContentBlocks blocks={item.body} />
         {item.reactions?.map((reaction) => (
            <Text type="supporting" key={reaction.emoji}>
               {reaction.emoji} {reaction.count}
            </Text>
         ))}
      </VStack>
   );
}

export function ActivityFeed({ issueId }: { issueId: string }) {
   const state = useIssueActivity(issueId);
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
   const items = [...state.activities.map(activityItem), ...state.comments.map(commentItem)];
   return (
      <DesignSurface>
         <VStack
            gap={4}
            paddingBlock={4}
            onKeyDown={(event) => {
               if (
                  event.key === 'Enter' &&
                  (event.ctrlKey || event.metaKey) &&
                  !uploading &&
                  !state.sending
               ) {
                  event.preventDefault();
                  void state.submit();
               }
            }}
         >
            <HStack justify="between" gap={2}>
               <Heading level={2}>Activity</Heading>
               <Button
                  label={issue?.isSubscribed ? 'Unsubscribe' : 'Subscribe'}
                  size="sm"
                  variant="ghost"
                  isDisabled={!issue}
                  clickAction={async () => {
                     if (issue) await updateSubscription(issue.id, !issue.isSubscribed);
                  }}
               />
            </HStack>
            {state.loading && <Text role="status">Loading activity…</Text>}
            {state.error && (
               <VStack gap={2}>
                  <Text role="alert">{state.error}</Text>
                  <Button label="Retry activity" onClick={state.retry} />
               </VStack>
            )}
            {items.map((item) =>
               item.kind === 'event' ? (
                  <EventRow key={item.id} item={item} />
               ) : (
                  <CommentRow key={item.id} item={item} />
               )
            )}
            <TextArea
               label="Comment"
               value={state.draft}
               onChange={state.setDraft}
               onPaste={onPaste}
               rows={3}
               placeholder="Leave a comment..."
               isDisabled={state.sending}
            />
            {state.submitError && <Text role="alert">{state.submitError}</Text>}
            <HStack justify="between" gap={2}>
               <Text type="supporting">
                  {uploading ? 'Uploading image…' : 'Paste a screenshot to attach it'}
               </Text>
               <Button
                  label="Comment"
                  size="sm"
                  variant="primary"
                  clickAction={state.submit}
                  isLoading={state.sending}
                  isDisabled={!state.draft.trim() || !state.workspaceId || uploading}
               />
            </HStack>
         </VStack>
      </DesignSurface>
   );
}
