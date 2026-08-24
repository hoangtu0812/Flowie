'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   Ban,
   CircleDot,
   Link2,
   Paperclip,
   PenLine,
   Plus,
   RefreshCcw,
   Tag,
   Unlock,
   X,
} from 'lucide-react';
import {
   useCallback,
   useEffect,
   useMemo,
   useRef,
   useState,
   type ChangeEvent,
   type ReactNode,
} from 'react';
import { loadCurrentWorkspace } from '@/lib/workspaces';

type ApiActor = { id: string; name: string; avatarUrl: string | null } | null;
type ApiAttachment = { id: string; filename: string; mimeType: string; size: number };
type ApiComment = {
   id: string;
   content: string;
   createdAt: string;
   author: NonNullable<ApiActor>;
   attachments: ApiAttachment[];
};
type ApiActivity = { id: string; type: string; createdAt: string; actor: ApiActor };
type FeedItem =
   | { kind: 'event'; id: string; type: string; createdAt: string; actor: ApiActor }
   | {
        kind: 'comment';
        id: string;
        content: string;
        createdAt: string;
        author: NonNullable<ApiActor>;
        attachments: ApiAttachment[];
     };

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;

const formatFileSize = (size: number) =>
   size < 1024 * 1024
      ? `${Math.max(1, Math.round(size / 1024))} KB`
      : `${(size / 1024 / 1024).toFixed(1)} MB`;

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
   'issue.unrelated': <Link2 className="size-3.5" />,
   'issue.subissue_created': <Plus className="size-3.5" />,
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
   if (type === 'issue.related') return 'linked this issue';
   if (type === 'issue.unrelated') return 'removed an issue link';
   if (type === 'issue.subissue_created') return 'created a sub-issue';
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
         {item.attachments.length > 0 && (
            <ul className="mt-2 space-y-1.5">
               {item.attachments.map((attachment) => (
                  <li className="flex items-center gap-2 text-xs" key={attachment.id}>
                     <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                     <a
                        className="min-w-0 truncate hover:underline"
                        href={`${api}/attachments/${attachment.id}/download`}
                     >
                        {attachment.filename}
                     </a>
                     <span className="shrink-0 text-muted-foreground">
                        {formatFileSize(attachment.size)}
                     </span>
                  </li>
               ))}
            </ul>
         )}
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
   const [pendingAttachment, setPendingAttachment] = useState<File>();
   const [saving, setSaving] = useState(false);
   const [subscribed, setSubscribed] = useState(initialSubscribed);
   const [error, setError] = useState<string>();
   const attachmentInputRef = useRef<HTMLInputElement>(null);

   const load = useCallback(async () => {
      const id = (await loadCurrentWorkspace()).id;
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
               attachments: comment.attachments,
            })),
         ].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      [activities, comments]
   );

   const selectAttachment = (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      if (file.size > MAX_ATTACHMENT_SIZE) {
         setError('Files must be 10 MB or smaller.');
         return;
      }
      setError(undefined);
      setPendingAttachment(file);
   };

   const submitComment = async () => {
      if (!workspaceId || !draft.trim()) return;
      setSaving(true);
      setError(undefined);
      let commentCreated = false;
      try {
         const response = await fetch(`${api}/comments`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, issueId, content: draft.trim() }),
         });
         if (!response.ok) throw new Error('Could not add the comment.');
         const payload = (await response.json()) as { data: { id: string } };
         const attachment = pendingAttachment;
         commentCreated = true;
         setDraft('');
         setPendingAttachment(undefined);
         if (attachment) {
            const form = new FormData();
            form.set('workspaceId', workspaceId);
            form.set('entityType', 'comment');
            form.set('entityId', payload.data.id);
            form.set('file', attachment);
            const uploadResponse = await fetch(`${api}/attachments`, {
               method: 'POST',
               credentials: 'include',
               body: form,
            });
            if (!uploadResponse.ok) {
               throw new Error('Comment was saved, but its attachment could not be uploaded.');
            }
         }
         await load();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not add the comment.');
         if (commentCreated) void load();
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
            {pendingAttachment && (
               <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Paperclip className="size-3.5 shrink-0" />
                  <span className="min-w-0 truncate">{pendingAttachment.name}</span>
                  <span className="shrink-0">{formatFileSize(pendingAttachment.size)}</span>
                  <button
                     type="button"
                     className="ml-auto rounded p-0.5 hover:bg-accent hover:text-foreground"
                     aria-label="Remove comment attachment"
                     onClick={() => setPendingAttachment(undefined)}
                     disabled={saving}
                  >
                     <X className="size-3.5" />
                  </button>
               </div>
            )}
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
               <button
                  type="button"
                  className="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                  aria-label="Add comment attachment"
                  title="Add attachment"
                  disabled={state !== 'ready' || saving}
                  onClick={() => attachmentInputRef.current?.click()}
               >
                  <Plus className="size-4" />
               </button>
               <input
                  ref={attachmentInputRef}
                  type="file"
                  className="sr-only"
                  onChange={selectAttachment}
                  aria-label="Upload comment attachment"
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
