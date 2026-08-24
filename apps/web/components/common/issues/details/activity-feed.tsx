'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
   contentDocumentFromText,
   normalizeContentDocument,
   type ContentDocument,
} from '@circle/contracts';
import {
   Ban,
   CircleDot,
   Link2,
   Paperclip,
   PenLine,
   Plus,
   RefreshCcw,
   SmilePlus,
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
import { ContentBlocks } from './content-blocks';

type ApiActor = { id: string; name: string; avatarUrl: string | null } | null;
type ApiAttachment = { id: string; filename: string; mimeType: string; size: number };
type ApiComment = {
   id: string;
   content: string;
   body: ContentDocument | null;
   createdAt: string;
   author: NonNullable<ApiActor>;
   attachments: ApiAttachment[];
   reactions: CommentReaction[];
};
type CommentReaction = { emoji: string; count: number; reacted: boolean };
type ApiActivity = {
   id: string;
   type: string;
   data: unknown;
   createdAt: string;
   actor: ApiActor;
};
type FeedItem =
   | {
        kind: 'event';
        id: string;
        type: string;
        data: unknown;
        createdAt: string;
        actor: ApiActor;
     }
   | {
        kind: 'comment';
        id: string;
        body: ContentDocument;
        createdAt: string;
        author: NonNullable<ApiActor>;
        attachments: ApiAttachment[];
        reactions: CommentReaction[];
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

const eventData = (value: unknown): Record<string, unknown> =>
   value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

const safePayloadText = (value: unknown, maxLength = 120) => {
   if (typeof value !== 'string') return undefined;
   const normalized = value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
   return normalized ? normalized.slice(0, maxLength) : undefined;
};

const updateFieldLabels: Record<string, string> = {
   title: 'title',
   description: 'description',
   statusId: 'status',
   priority: 'priority',
   assigneeId: 'assignee',
   projectId: 'project',
   parentIssueId: 'parent issue',
   estimate: 'estimate',
   dueDate: 'due date',
   labelIds: 'labels',
   cycleId: 'cycle',
   releaseIds: 'releases',
};

const eventText = (type: string, rawData: unknown) => {
   const data = eventData(rawData);
   const relatedIdentifier = safePayloadText(data.relatedIdentifier, 64);

   if (type === 'issue.created') return 'created this issue';
   if (type === 'issue.updated') {
      const fields = Array.isArray(data.fields)
         ? [
              ...new Set(
                 data.fields
                    .map((field) =>
                       typeof field === 'string' ? updateFieldLabels[field] : undefined
                    )
                    .filter((field): field is string => Boolean(field))
              ),
           ]
         : [];
      return fields.length ? `updated ${fields.join(', ')}` : 'updated this issue';
   }
   if (type === 'issue.archived') return 'archived this issue';
   if (type === 'issue.related')
      return relatedIdentifier ? `linked this issue to ${relatedIdentifier}` : 'linked this issue';
   if (type === 'issue.unrelated')
      return relatedIdentifier
         ? `removed the link to ${relatedIdentifier}`
         : 'removed an issue link';
   if (type === 'issue.subissue_created') {
      const identifier = safePayloadText(data.identifier, 64);
      return identifier ? `created sub-issue ${identifier}` : 'created a sub-issue';
   }
   if (type === 'issue.converted_to_comment') {
      const identifier = safePayloadText(data.targetIdentifier, 64);
      return identifier
         ? `converted this issue into a comment on ${identifier}`
         : 'converted this issue into a comment';
   }
   if (type === 'issue.moved') {
      const identifier = safePayloadText(data.identifier, 64);
      return identifier ? `moved this issue to ${identifier}` : 'moved this issue';
   }
   if (type === 'issue.classified') {
      const resolution = safePayloadText(data.resolution, 32);
      const duplicateIdentifier = safePayloadText(data.duplicateIdentifier, 64);
      if (resolution === 'DUPLICATE') {
         return duplicateIdentifier
            ? `marked this issue as duplicate of ${duplicateIdentifier}`
            : 'marked this issue as duplicate';
      }
      if (resolution === 'WONT_FIX') return "marked this issue as won't fix";
      return 'classified this issue';
   }
   if (type === 'issue.blocked')
      return relatedIdentifier
         ? `marked this issue as blocked by ${relatedIdentifier}`
         : 'marked this issue as blocked';
   if (type === 'issue.unblocked')
      return relatedIdentifier
         ? `removed blocker ${relatedIdentifier}`
         : 'removed an issue blocker';
   return 'updated this issue';
};

function EventRow({ item }: { item: Extract<FeedItem, { kind: 'event' }> }) {
   return (
      <div className="flex items-center gap-2.5 text-sm text-muted-foreground py-1.5">
         <span className="size-5 rounded-full bg-accent flex items-center justify-center shrink-0">
            {EVENT_ICONS[item.type] ?? <CircleDot className="size-3.5" />}
         </span>
         <span className="min-w-0 truncate">
            <span className="text-foreground/90 font-medium">{item.actor?.name ?? 'System'}</span>{' '}
            {eventText(item.type, item.data)}
         </span>
         <span className="shrink-0 text-xs">· {relativeTime(item.createdAt)}</span>
      </div>
   );
}

const QUICK_REACTIONS = ['👍', '❤️', '🎉', '👀', '🚀'];

function CommentCard({
   item,
   reacting,
   onToggleReaction,
}: {
   item: Extract<FeedItem, { kind: 'comment' }>;
   reacting: boolean;
   onToggleReaction: (emoji: string) => void;
}) {
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
         <div className="text-sm [&_p]:my-1.5">
            <ContentBlocks blocks={item.body.blocks} />
         </div>
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
         <div className="flex items-center gap-1.5 mt-1">
            {item.reactions.map((reaction) => (
               <button
                  type="button"
                  key={reaction.emoji}
                  disabled={reacting}
                  aria-pressed={reaction.reacted}
                  onClick={() => onToggleReaction(reaction.emoji)}
                  className={`inline-flex items-center gap-1 text-xs border border-border/60 rounded-full px-2 py-0.5 disabled:opacity-50 ${
                     reaction.reacted ? 'bg-accent text-foreground' : 'bg-accent/60'
                  }`}
               >
                  {reaction.emoji} {reaction.count}
               </button>
            ))}
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <button
                     type="button"
                     disabled={reacting}
                     aria-label="Add reaction"
                     className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                     <SmilePlus className="size-3.5" />
                  </button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="start" className="min-w-0 flex gap-0.5">
                  {QUICK_REACTIONS.map((emoji) => (
                     <DropdownMenuItem
                        key={emoji}
                        aria-label={`React with ${emoji}`}
                        className="text-base px-2"
                        onSelect={() => onToggleReaction(emoji)}
                     >
                        {emoji}
                     </DropdownMenuItem>
                  ))}
               </DropdownMenuContent>
            </DropdownMenu>
         </div>
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
   const [reactingCommentId, setReactingCommentId] = useState<string>();
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
                  data: activity.data,
                  createdAt: activity.createdAt,
                  actor: activity.actor,
               })),
            ...comments.map((comment) => ({
               kind: 'comment' as const,
               id: comment.id,
               body: normalizeContentDocument(comment.body, comment.content),
               createdAt: comment.createdAt,
               author: comment.author,
               attachments: comment.attachments,
               reactions: comment.reactions,
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
            body: JSON.stringify({
               workspaceId,
               issueId,
               content: draft.trim(),
               body: contentDocumentFromText(draft.trim()),
            }),
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

   const toggleReaction = async (commentId: string, emoji: string) => {
      if (!workspaceId || reactingCommentId) return;
      setReactingCommentId(commentId);
      setError(undefined);
      try {
         const response = await fetch(`${api}/comments/${commentId}/reactions/toggle`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, emoji }),
         });
         if (!response.ok) throw new Error('Could not update the reaction.');
         const reactions = ((await response.json()) as { data: CommentReaction[] }).data;
         setComments((current) =>
            current.map((comment) =>
               comment.id === commentId ? { ...comment, reactions } : comment
            )
         );
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not update the reaction.');
      } finally {
         setReactingCommentId(undefined);
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
                     <CommentCard
                        key={item.id}
                        item={item}
                        reacting={reactingCommentId === item.id}
                        onToggleReaction={(emoji) => void toggleReaction(item.id, emoji)}
                     />
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
