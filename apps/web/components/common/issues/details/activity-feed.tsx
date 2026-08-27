'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useImagePaste } from '@/hooks/use-image-paste';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { ActivityItem, ContentBlock } from '@/mock-data/issue-details';
import { User } from '@/mock-data/users';
import {
   Ban,
   CircleDot,
   GitPullRequestArrow,
   Link2,
   PenLine,
   RefreshCcw,
   SmilePlus,
   Tag,
   Unlock,
} from 'lucide-react';
import { ReactNode, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ContentBlocks } from './content-blocks';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

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
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-1.5">
         <span className="size-5 rounded-full bg-accent flex items-center justify-center shrink-0">
            {EVENT_ICONS[item.event] ?? <CircleDot className="size-3.5" />}
         </span>
         <span className="min-w-0 truncate">
            <span className="text-foreground/90 font-medium">{item.actor.name}</span> {item.text}
         </span>
         <span className="shrink-0 text-xs">· {item.timeAgo}</span>
      </div>
   );
}

function CommentCard({ item }: { item: Extract<ActivityItem, { kind: 'comment' }> }) {
   return (
      <div className="my-2 rounded-lg border border-border/60 bg-container p-3.5">
         <div className="flex items-center gap-2 mb-1.5">
            <Avatar className="size-5">
               <AvatarImage src={item.actor.avatarUrl} alt={item.actor.name} />
               <AvatarFallback>{item.actor.name[0]}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{item.actor.name}</span>
            <span className="text-xs text-muted-foreground">{item.timeAgo}</span>
         </div>
         <div className="text-sm [&_p]:my-1.5">
            <ContentBlocks blocks={item.body} />
         </div>
         <div className="flex items-center gap-1.5 mt-1">
            {item.reactions?.map((reaction) => (
               <span
                  key={reaction.emoji}
                  className="inline-flex items-center gap-1 text-xs bg-accent/60 border border-border/60 rounded-full px-2 py-0.5"
               >
                  {reaction.emoji} {reaction.count}
               </span>
            ))}
            <button className="text-muted-foreground hover:text-foreground">
               <SmilePlus className="size-3.5" />
            </button>
         </div>
      </div>
   );
}

/** Existing Circle activity presentation, hydrated from persisted Python records. */
export function ActivityFeed({ issueId }: { issueId: string }) {
   const [items, setItems] = useState<ActivityItem[]>([]);
   const [draft, setDraft] = useState('');
   const [workspaceId, setWorkspaceId] = useState<string>();

   useEffect(() => {
      let active = true;
      void (async () => {
         try {
            const workspace = await loadCurrentWorkspace();
            const query = new URLSearchParams({ workspaceId: workspace.id, issueId });
            const [activitiesResponse, commentsResponse] = await Promise.all([
               authenticatedFetch(`${api}/activities?${query}`),
               authenticatedFetch(`${api}/comments?${query}`),
            ]);
            if (!activitiesResponse.ok || !commentsResponse.ok)
               throw new Error('Could not load activity.');
            const activities = (
               (await activitiesResponse.json()) as { data: NativeActivity[] }
            ).data.filter((item) => item.type !== 'comment.created');
            const comments = ((await commentsResponse.json()) as { data: NativeComment[] }).data;
            if (active) {
               setWorkspaceId(workspace.id);
               setItems([...activities.map(activityItem), ...comments.map(commentItem)]);
            }
         } catch {
            if (active) setItems([]);
         }
      })();
      return () => {
         active = false;
      };
   }, [issueId]);

   const { onPaste: onPasteImage, uploading: uploadingImage } = useImagePaste({
      workspaceId,
      entityType: 'issue',
      entityId: issueId,
      value: draft,
      onChange: setDraft,
   });

   const submitComment = async () => {
      const content = draft.trim();
      if (!content || !workspaceId) return;
      const response = await authenticatedFetch(`${api}/comments`, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, issueId, content }),
      });
      if (!response.ok) {
         toast.error('Could not post comment.');
         return;
      }
      const comment = ((await response.json()) as { data: NativeComment }).data;
      setItems((previous) => [...previous, commentItem(comment)]);
      setDraft('');
   };

   return (
      <div className="mt-10">
         <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold">Activity</h2>
            <button className="text-xs text-muted-foreground hover:text-foreground">
               Subscribe
            </button>
         </div>
         <div className="flex flex-col">
            {items.map((item) =>
               item.kind === 'event' ? (
                  <EventRow key={item.id} item={item} />
               ) : (
                  <CommentCard key={item.id} item={item} />
               )
            )}
         </div>
         <div className="mt-3 rounded-lg border border-border/60 bg-container p-3 flex flex-col gap-2">
            <textarea
               value={draft}
               onChange={(event) => setDraft(event.target.value)}
               onPaste={onPasteImage}
               onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey))
                     void submitComment();
               }}
               placeholder="Leave a comment..."
               rows={2}
               className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-muted-foreground"
            />
            <div className="flex items-center justify-between">
               <span className="text-xs text-muted-foreground">
                  {uploadingImage ? 'Uploading image…' : 'Paste a screenshot to attach it'}
               </span>
               <Button
                  size="xs"
                  onClick={() => void submitComment()}
                  disabled={!draft.trim() || !workspaceId || uploadingImage}
               >
                  Comment
               </Button>
            </div>
         </div>
      </div>
   );
}
