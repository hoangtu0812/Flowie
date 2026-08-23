'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Ban, CircleDot, Link2, PenLine, Plus, RefreshCcw, Tag, Unlock } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

type ApiActor = { id: string; name: string; avatarUrl: string | null } | null;
type ApiComment = { id: string; content: string; createdAt: string; author: NonNullable<ApiActor> };
type ApiActivity = { id: string; type: string; createdAt: string; actor: ApiActor };
type FeedItem =
   | { kind: 'event'; id: string; type: string; createdAt: string; actor: ApiActor }
   | {
        kind: 'comment';
        id: string;
        content: string;
        createdAt: string;
        author: NonNullable<ApiActor>;
     };

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const EVENT_ICONS: Record<string, ReactNode> = {
   'issue.created': <PenLine className="size-3.5" />,
   'issue.updated': <CircleDot className="size-3.5" />,
   'issue.archived': <Ban className="size-3.5" />,
   'issue.status_changed': <CircleDot className="size-3.5" />,
   'issue.label_changed': <Tag className="size-3.5" />,
   'issue.cycle_changed': <RefreshCcw className="size-3.5" />,
   'issue.blocked': <Ban className="size-3.5" />,
   'issue.unblocked': <Unlock className="size-3.5" />,
   'issue.related': <Link2 className="size-3.5" />,
};

const relativeTime = (value: string) => {
   const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
   if (seconds < 60) return 'just now';
   const minutes = Math.floor(seconds / 60);
   if (minutes < 60) return `${minutes}m ago`;
   const hours = Math.floor(minutes / 60);
   if (hours < 24) return `${hours}h ago`;
   const days = Math.floor(hours / 24);
   return `${days}d ago`;
};

const eventText = (type: string) => {
   if (type === 'issue.created') return 'created this issue';
   if (type === 'issue.updated') return 'updated this issue';
   if (type === 'issue.archived') return 'archived this issue';
   return type.replace(/[._]/g, ' ');
};

function EventRow({ item }: { item: Extract<FeedItem, { kind: 'event' }> }) {
   return (
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-1.5">
         <span className="size-5 rounded-full bg-accent flex items-center justify-center shrink-0">
            {EVENT_ICONS[item.type] ?? <CircleDot className="size-3.5" />}
         </span>
         <span className="min-w-0 truncate">
            <span className="text-foreground/90 font-medium">{item.actor?.name ?? 'System'}</span>{' '}
            {eventText(item.type)}
         </span>
         <span className="shrink-0 text-xs">· {relativeTime(item.createdAt)}</span>
      </div>
   );
}

function CommentCard({ item }: { item: Extract<FeedItem, { kind: 'comment' }> }) {
   return (
      <div className="my-2 rounded-lg border border-border/60 bg-container p-3.5">
         <div className="flex items-center gap-2 mb-1.5">
            <Avatar className="size-5">
               <AvatarImage src={item.author.avatarUrl ?? undefined} alt={item.author.name} />
               <AvatarFallback>{item.author.name[0]}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{item.author.name}</span>
            <span className="text-xs text-muted-foreground">{relativeTime(item.createdAt)}</span>
         </div>
         <p className="whitespace-pre-wrap text-sm leading-6">{item.content}</p>
      </div>
   );
}

/** Original issue activity layout backed by persisted comments, events, and subscriptions. */
export function ActivityFeed({
   issueId,
   initialSubscribed,
}: {
   issueId: string;
   initialSubscribed: boolean;
}) {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [comments, setComments] = useState<ApiComment[]>([]);
   const [activities, setActivities] = useState<ApiActivity[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [draft, setDraft] = useState('');
   const [saving, setSaving] = useState(false);
   const [subscribed, setSubscribed] = useState(initialSubscribed);
   const [error, setError] = useState<string>();

   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspacePayload = (await workspaceResponse.json()) as {
         data: Array<{ workspace: { id: string } }>;
      };
      const id = workspacePayload.data[0]?.workspace.id;
      if (!id) throw new Error('No workspace is available.');
      setWorkspaceId(id);

      const query = new URLSearchParams({ workspaceId: id, issueId });
      const [commentsResponse, activitiesResponse] = await Promise.all([
         fetch(`${api}/comments?${query}`, { credentials: 'include' }),
         fetch(`${api}/activities?${query}`, { credentials: 'include' }),
      ]);
      if (!commentsResponse.ok || !activitiesResponse.ok) {
         throw new Error('Could not load activity.');
      }
      setComments(((await commentsResponse.json()) as { data: ApiComment[] }).data);
      setActivities(((await activitiesResponse.json()) as { data: ApiActivity[] }).data);
   }, [issueId]);

   useEffect(() => {
      setSubscribed(initialSubscribed);
   }, [initialSubscribed]);

   useEffect(() => {
      setState('loading');
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);

   const items = useMemo<FeedItem[]>(
      () =>
         [
            ...activities
               .filter((activity) => activity.type !== 'comment.created')
               .map((activity) => ({
                  kind: 'event' as const,
                  id: activity.id,
                  type: activity.type,
                  createdAt: activity.createdAt,
                  actor: activity.actor,
               })),
            ...comments.map((comment) => ({
               kind: 'comment' as const,
               id: comment.id,
               content: comment.content,
               createdAt: comment.createdAt,
               author: comment.author,
            })),
         ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      [activities, comments]
   );

   const submitComment = async () => {
      if (!workspaceId || !draft.trim()) return;
      setSaving(true);
      setError(undefined);
      try {
         const response = await fetch(`${api}/comments`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, issueId, content: draft.trim() }),
         });
         if (!response.ok) throw new Error('Could not add the comment.');
         setDraft('');
         await load();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not add the comment.');
      } finally {
         setSaving(false);
      }
   };

   const toggleSubscription = async () => {
      if (!workspaceId) return;
      const next = !subscribed;
      setSaving(true);
      setError(undefined);
      try {
         const response = await fetch(
            `${api}/issues/${issueId}/subscribers/me?workspaceId=${workspaceId}`,
            { method: next ? 'POST' : 'DELETE', credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not update subscription.');
         setSubscribed(next);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not update subscription.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <div className="mt-10">
         <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold">Activity</h2>
            <button
               type="button"
               className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
               disabled={state !== 'ready' || saving}
               onClick={() => void toggleSubscription()}
            >
               {subscribed ? 'Unsubscribe' : 'Subscribe'}
            </button>
         </div>

         {state === 'loading' && (
            <p className="py-3 text-sm text-muted-foreground">Loading activity…</p>
         )}
         {state === 'error' && (
            <p className="py-3 text-sm text-destructive">Could not load activity.</p>
         )}
         {state === 'ready' && !items.length && (
            <p className="py-3 text-sm text-muted-foreground">No activity yet.</p>
         )}
         {state === 'ready' && (
            <div className="flex flex-col">
               {items.map((item) =>
                  item.kind === 'event' ? (
                     <EventRow key={item.id} item={item} />
                  ) : (
                     <CommentCard key={item.id} item={item} />
                  )
               )}
            </div>
         )}

         <div className="mt-3 rounded-lg border border-border/60 bg-container p-3 flex flex-col gap-2">
            <textarea
               value={draft}
               onChange={(event) => setDraft(event.target.value)}
               onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                     event.preventDefault();
                     void submitComment();
                  }
               }}
               placeholder="Leave a comment..."
               rows={2}
               disabled={state !== 'ready' || saving}
               className="w-full resize-none bg-transparent outline-none text-sm placeholder:text-muted-foreground disabled:cursor-not-allowed"
            />
            <div className="flex items-center justify-between">
               <Plus
                  className="size-4 text-muted-foreground opacity-50"
                  aria-label="Attachments in comments are not available yet"
               />
               <Button
                  size="xs"
                  onClick={() => void submitComment()}
                  disabled={!draft.trim() || saving || state !== 'ready'}
               >
                  {saving ? 'Saving…' : 'Comment'}
               </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
         </div>
      </div>
   );
}
