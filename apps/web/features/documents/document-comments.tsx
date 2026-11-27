'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessageSquare, MessageSquarePlus, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CommentMentions } from '@/features/issues/comment-mentions';
import { useMessages } from '@/features/shared/use-messages';
import {
   blockKey,
   COMMENT_BLOCKS,
   resolveBlock,
   type DocumentCommentAnchor,
} from '@/lib/document-comment-anchor';
import { openNotificationStream } from '@/lib/notification-stream';
import { relativeTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { loadCurrentWorkspace } from '@/lib/workspaces';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import {
   createDocumentComment,
   deleteDocumentComment,
   documentMentionOptions,
   loadDocumentComments,
   updateDocumentComment,
   type DocumentComment,
} from './document-comments-api';
import { commentMessages } from './messages.vi';

type Box = { top: number; left: number; width: number; height: number };
type Layout = {
   blocks: Element[];
   boxes: Box[];
   texts: string[];
   contains: number[][];
   width: number;
};
type Tx = ReturnType<typeof useMessages<typeof commentMessages>>;

const CARD_WIDTH = 320;
const EMPTY: Layout = { blocks: [], boxes: [], texts: [], contains: [], width: 0 };

/**
 * Reads the rendered blocks of `content`: their boxes relative to `frame`, their text, and which
 * blocks sit inside each one (descendants follow their parent in document order).
 * VI: Đọc các đoạn đã render trong `content`: khung so với `frame`, chữ, và các đoạn nằm trong
 * VI: từng đoạn (đoạn con đứng ngay sau đoạn cha theo thứ tự tài liệu).
 */
function measure(frame: HTMLElement, content: HTMLElement): Layout {
   const origin = frame.getBoundingClientRect();
   const blocks = [...content.querySelectorAll(COMMENT_BLOCKS)];
   const contains = blocks.map((block, index) => {
      const inner: number[] = [];
      for (let next = index + 1; next < blocks.length && block.contains(blocks[next]); next++)
         inner.push(next);
      return inner;
   });
   return {
      blocks,
      contains,
      texts: blocks.map((block) => block.textContent ?? ''),
      boxes: blocks.map((block) => {
         const box = block.getBoundingClientRect();
         return {
            top: box.top - origin.top,
            left: box.left - origin.left,
            width: box.width,
            height: box.height,
         };
      }),
      width: origin.width,
   };
}

/** Text ranges of `quote` inside `block`, for the highlight. VI: Các range chữ của `quote` trong `block`, để tô sáng. */
function quoteRange(block: Element, quote: string): Range | undefined {
   const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT);
   const nodes: Text[] = [];
   for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
   const whole = nodes.map((node) => node.data).join('');
   const start = whole.indexOf(quote);
   if (start < 0) return undefined;
   const range = block.ownerDocument.createRange();
   let offset = 0;
   for (const node of nodes) {
      const end = offset + node.data.length;
      if (start >= offset && start <= end) range.setStart(node, start - offset);
      if (start + quote.length >= offset && start + quote.length <= end) {
         range.setEnd(node, start + quote.length - offset);
         return range;
      }
      offset = end;
   }
   return undefined;
}

/**
 * Comment layer over a rendered Markdown document (DTD-1070): + beside a hovered line, a Comment
 * button over selected text, a count beside each line with threads, a thread card beside the
 * line and a list of every thread above the text. Threads find their line again by its text
 * after edits; a thread whose text is gone is listed as "Content changed". Readers see each
 * other's comments at once through the workspace notification socket. Without `documentId`
 * (an older release, a document not saved yet) only the text is shown.
 * VI: Lớp comment trên tài liệu Markdown đã render (DTD-1070): nút + cạnh dòng đang trỏ chuột, nút
 * VI: Comment trên chữ được bôi đen, số đếm cạnh dòng có thread, thẻ thread cạnh dòng và danh sách
 * VI: mọi thread phía trên nội dung. Thread tìm lại dòng theo chữ sau khi tài liệu bị sửa; thread
 * VI: mất chỗ gắn được liệt kê là "Nội dung đã thay đổi". Người đọc thấy comment của nhau ngay qua
 * VI: socket thông báo của workspace. Không có `documentId` (bản phát hành cũ, tài liệu chưa lưu)
 * VI: thì chỉ hiện nội dung.
 */
export function DocumentComments({
   documentId,
   children,
}: {
   documentId?: string;
   children: React.ReactNode;
}) {
   if (!documentId) return <>{children}</>;
   return <CommentLayer documentId={documentId}>{children}</CommentLayer>;
}

function CommentLayer({ documentId, children }: { documentId: string; children: React.ReactNode }) {
   const tx = useMessages(commentMessages);
   const frame = useRef<HTMLDivElement>(null);
   const content = useRef<HTMLDivElement>(null);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [comments, setComments] = useState<DocumentComment[]>([]);
   const [failed, setFailed] = useState(false);
   const [layout, setLayout] = useState<Layout>(EMPTY);
   const [hover, setHover] = useState<number>();
   const [selection, setSelection] = useState<{
      index: number;
      quote: string;
      top: number;
      left: number;
   }>();
   // The open card: a line's threads, plus a new thread's quote when one is being written.
   // VI: Thẻ đang mở: các thread của một dòng, kèm cụm trích khi đang viết thread mới.
   const [open, setOpen] = useState<{ index: number; compose: boolean; quote?: string }>();
   const [listOpen, setListOpen] = useState(false);
   const [showResolved, setShowResolved] = useState(false);

   const reload = useCallback(() => {
      loadDocumentComments(documentId)
         .then((rows) => {
            setComments(rows);
            setFailed(false);
         })
         .catch(() => setFailed(true));
   }, [documentId]);

   useEffect(() => {
      setComments([]);
      setOpen(undefined);
      reload();
   }, [reload]);

   useEffect(() => {
      let active = true;
      void loadCurrentWorkspace().then((workspace) => active && setWorkspaceId(workspace.id));
      return () => {
         active = false;
      };
   }, []);

   useEffect(() => {
      if (!workspaceId) return;
      return openNotificationStream(workspaceId, {
         onNotification: () => undefined,
         onReconnect: reload,
         onDocumentComments: (id) => {
            if (id === documentId) reload();
         },
      });
   }, [workspaceId, documentId, reload]);

   // Boxes follow the rendered text: re-measured when it changes size (Mermaid, images) or content.
   // VI: Khung bám theo nội dung đã render: đo lại khi đổi kích thước (Mermaid, ảnh) hoặc nội dung.
   useLayoutEffect(() => {
      const outer = frame.current;
      const inner = content.current;
      if (!outer || !inner) return;
      let pending = 0;
      const update = () => {
         pending = 0;
         setLayout(measure(outer, inner));
      };
      const schedule = () => {
         if (!pending) pending = requestAnimationFrame(update);
      };
      update();
      const resize = new ResizeObserver(schedule);
      resize.observe(inner);
      const mutation = new MutationObserver(schedule);
      mutation.observe(inner, { childList: true, subtree: true, characterData: true });
      return () => {
         resize.disconnect();
         mutation.disconnect();
         cancelAnimationFrame(pending);
      };
   }, []);

   // A selection inside one line offers a Comment button above it (mouse or keyboard).
   // VI: Chữ bôi đen trong một dòng hiện nút Comment phía trên (bằng chuột hoặc bàn phím).
   useEffect(() => {
      const changed = () => {
         const outer = frame.current;
         const inner = content.current;
         const current = document.getSelection();
         if (!outer || !inner || !current || current.isCollapsed || !current.rangeCount)
            return setSelection(undefined);
         const range = current.getRangeAt(0);
         const element = (node: Node) =>
            (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement)?.closest(
               COMMENT_BLOCKS
            );
         const block = element(range.startContainer);
         const end = element(range.endContainer);
         const quote = current.toString().trim();
         if (
            !block ||
            !end ||
            !inner.contains(block) ||
            !quote ||
            !(block === end || block.contains(end))
         )
            return setSelection(undefined);
         const index = [...inner.querySelectorAll(COMMENT_BLOCKS)].indexOf(block);
         const box = range.getBoundingClientRect();
         const origin = outer.getBoundingClientRect();
         setSelection({
            index,
            quote: quote.slice(0, 1000),
            top: Math.max(0, box.top - origin.top - 34),
            left: Math.max(0, Math.min(box.left - origin.left, origin.width - 110)),
         });
      };
      document.addEventListener('selectionchange', changed);
      return () => document.removeEventListener('selectionchange', changed);
   }, []);

   const roots = useMemo(() => comments.filter((comment) => !comment.parentId), [comments]);
   const replies = useMemo(() => {
      const map = new Map<string, DocumentComment[]>();
      for (const comment of comments)
         if (comment.parentId)
            map.set(comment.parentId, [...(map.get(comment.parentId) ?? []), comment]);
      return map;
   }, [comments]);
   const placed = useMemo(
      () =>
         roots.map((root) => ({
            root,
            index: root.anchor ? resolveBlock(layout.texts, root.anchor, layout.contains) : -1,
         })),
      [roots, layout.texts, layout.contains]
   );
   const visible = placed.filter((entry) => showResolved || !entry.root.resolvedAt);
   const counts = new Map<number, number>();
   for (const entry of visible)
      if (entry.index >= 0) counts.set(entry.index, (counts.get(entry.index) ?? 0) + 1);
   const openCount = roots.filter((root) => !root.resolvedAt).length;

   // Quoted phrases of the shown threads are highlighted without touching React's DOM.
   // VI: Cụm chữ được trích của các thread đang hiện được tô sáng mà không đụng vào DOM của React.
   useEffect(() => {
      if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;
      const ranges = visible.flatMap(({ root, index }) => {
         const block = layout.blocks[index];
         const range =
            block && root.anchor?.quote ? quoteRange(block, root.anchor.quote) : undefined;
         return range ? [range] : [];
      });
      // One shared highlight; each layer adds and removes only its own ranges.
      // VI: Một highlight dùng chung; mỗi lớp chỉ thêm và gỡ range của chính nó.
      const highlight = CSS.highlights.get('document-comment') ?? new Highlight();
      CSS.highlights.set('document-comment', highlight);
      ranges.forEach((range) => highlight.add(range));
      return () => ranges.forEach((range) => highlight.delete(range));
   });

   const anchorOf = (index: number, quote?: string): DocumentCommentAnchor => ({
      blockText: blockKey(layout.texts[index] ?? ''),
      blockIndex: index,
      quote: quote ?? null,
   });
   const run = async (action: Promise<DocumentComment[]>) => setComments(await action);

   const card = open && layout.boxes[open.index];
   const cardBox = card && {
      top: card.top,
      ...(layout.width - (card.left + card.width) >= CARD_WIDTH + 24
         ? { left: card.left + card.width + 16 }
         : { left: Math.max(0, layout.width - CARD_WIDTH), top: card.top + card.height + 6 }),
   };
   const hovered = hover !== undefined && !open ? layout.boxes[hover] : undefined;

   return (
      <div className="flex min-w-0 flex-col gap-3">
         <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
            {failed && <span role="alert">{tx('Could not load comments.')}</span>}
            <Button
               size="xxs"
               variant="ghost"
               aria-expanded={listOpen}
               onClick={() => setListOpen((value) => !value)}
               data-testid="document-comments-toggle"
            >
               <MessageSquare className="size-3.5" />
               {tx('Comments')}
               {openCount > 0 && ` · ${tx('{count} open', { count: String(openCount) })}`}
            </Button>
         </div>
         {listOpen && workspaceId && (
            <section
               aria-label={tx('Comments')}
               className="mx-auto flex w-full max-w-3xl flex-col gap-2 rounded-lg border bg-muted/20 p-3"
            >
               <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input
                     type="checkbox"
                     checked={showResolved}
                     onChange={(event) => setShowResolved(event.target.checked)}
                  />
                  {tx('Show resolved')}
               </label>
               {visible.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                     {tx('No comments yet. Select text, or use + beside a line, to comment.')}
                  </p>
               )}
               {visible.map(({ root, index }) =>
                  index < 0 ? (
                     <Thread
                        key={root.id}
                        tx={tx}
                        root={root}
                        replies={replies.get(root.id) ?? []}
                        documentId={documentId}
                        workspaceId={workspaceId}
                        run={run}
                        orphan
                     />
                  ) : (
                     <button
                        key={root.id}
                        type="button"
                        className="flex min-w-0 flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                        onClick={() => {
                           layout.blocks[index]?.scrollIntoView({
                              block: 'center',
                              behavior: 'smooth',
                           });
                           setOpen({ index, compose: false });
                        }}
                     >
                        <span className="w-full truncate text-muted-foreground italic">
                           “{root.anchor?.quote || root.anchor?.blockText}”
                        </span>
                        <span className="w-full truncate">
                           <strong>{root.author.name}:</strong> {root.content}
                           {root.resolvedAt &&
                              ` · ${tx('Resolved by {name}', { name: root.resolvedBy?.name ?? '—' })}`}
                        </span>
                     </button>
                  )
               )}
            </section>
         )}
         <div
            ref={frame}
            className="relative min-w-0"
            onMouseLeave={() => setHover(undefined)}
            data-testid="document-comment-layer"
         >
            <div
               ref={content}
               onMouseMove={(event) => {
                  const block = (event.target as Element).closest?.(COMMENT_BLOCKS);
                  const index = block ? layout.blocks.indexOf(block) : -1;
                  if (index >= 0 && index !== hover) setHover(index);
               }}
            >
               {children}
            </div>
            {card && (
               <div
                  aria-hidden
                  className="pointer-events-none absolute rounded bg-amber-200/30 dark:bg-amber-400/10"
                  style={{
                     top: card.top - 2,
                     left: card.left - 4,
                     width: card.width + 8,
                     height: card.height + 4,
                  }}
               />
            )}
            {hovered && workspaceId && (
               <button
                  type="button"
                  aria-label={tx('Comment on this line')}
                  title={tx('Comment on this line')}
                  className="absolute z-10 flex size-6 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-xs hover:text-foreground"
                  style={{ top: hovered.top, left: Math.max(0, hovered.left - 30) }}
                  onClick={() => setOpen({ index: hover!, compose: true })}
               >
                  <MessageSquarePlus className="size-3.5" />
               </button>
            )}
            {selection && workspaceId && (
               <Button
                  size="xxs"
                  className="absolute z-20 shadow-md"
                  style={{ top: selection.top, left: selection.left }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                     setOpen({ index: selection.index, compose: true, quote: selection.quote });
                     setSelection(undefined);
                  }}
                  data-testid="document-comment-selection"
               >
                  <MessageSquarePlus className="size-3.5" />
                  {tx('Comment')}
               </Button>
            )}
            {[...counts].map(([index, count]) => {
               const box = layout.boxes[index];
               return box ? (
                  <button
                     key={index}
                     type="button"
                     aria-label={`${tx('Comment thread')} (${count})`}
                     className={cn(
                        'absolute z-10 flex h-6 items-center gap-1 rounded-md border bg-background px-1.5 text-xs text-muted-foreground shadow-xs hover:text-foreground',
                        open?.index === index && 'border-primary text-foreground'
                     )}
                     style={{
                        top: box.top,
                        left: Math.min(box.left + box.width + 6, layout.width - 40),
                     }}
                     onClick={() =>
                        setOpen(open?.index === index ? undefined : { index, compose: false })
                     }
                     data-testid="document-comment-marker"
                  >
                     <MessageSquare className="size-3" />
                     {count}
                  </button>
               ) : null;
            })}
            {open && cardBox && workspaceId && (
               <div
                  role="dialog"
                  aria-label={tx('Comment thread')}
                  className="absolute z-30 flex max-h-[28rem] flex-col gap-3 overflow-auto rounded-lg border bg-popover p-3 text-sm shadow-lg"
                  style={{ ...cardBox, width: Math.min(CARD_WIDTH, layout.width) }}
                  onKeyDown={(event) => {
                     if (event.key === 'Escape') setOpen(undefined);
                  }}
               >
                  <div className="flex items-start justify-between gap-2">
                     <span className="line-clamp-2 text-xs text-muted-foreground italic">
                        “{open.quote || blockKey(layout.texts[open.index] ?? '').slice(0, 140)}”
                     </span>
                     <Button
                        size="xxs"
                        variant="ghost"
                        aria-label={tx('Close')}
                        onClick={() => setOpen(undefined)}
                     >
                        <X className="size-3.5" />
                     </Button>
                  </div>
                  {placed
                     .filter(
                        (entry) =>
                           entry.index === open.index && (showResolved || !entry.root.resolvedAt)
                     )
                     .map(({ root }) => (
                        <Thread
                           key={root.id}
                           tx={tx}
                           root={root}
                           replies={replies.get(root.id) ?? []}
                           documentId={documentId}
                           workspaceId={workspaceId}
                           run={run}
                        />
                     ))}
                  {open.compose ? (
                     <Composer
                        tx={tx}
                        documentId={documentId}
                        workspaceId={workspaceId}
                        placeholder={tx('Write a comment… Type @ to mention someone.')}
                        autoFocus
                        onCancel={() => setOpen({ ...open, compose: false, quote: undefined })}
                        onSubmit={async (text, mentionIds) => {
                           await run(
                              createDocumentComment(documentId, {
                                 content: text,
                                 mentionIds,
                                 anchor: anchorOf(open.index, open.quote),
                              })
                           );
                           setOpen({ index: open.index, compose: false });
                        }}
                     />
                  ) : (
                     <Button
                        size="xxs"
                        variant="outline"
                        className="self-start"
                        onClick={() => setOpen({ ...open, compose: true })}
                     >
                        <MessageSquarePlus className="size-3.5" />
                        {tx('Comment')}
                     </Button>
                  )}
               </div>
            )}
         </div>
      </div>
   );
}

function Thread({
   tx,
   root,
   replies,
   documentId,
   workspaceId,
   run,
   orphan = false,
}: {
   tx: Tx;
   root: DocumentComment;
   replies: DocumentComment[];
   documentId: string;
   workspaceId: string;
   run: (action: Promise<DocumentComment[]>) => Promise<void>;
   orphan?: boolean;
}) {
   const [replying, setReplying] = useState(false);
   return (
      <div
         className={cn(
            'flex flex-col gap-2 rounded-md border bg-background p-2',
            root.resolvedAt && 'opacity-70'
         )}
         data-testid="document-comment-thread"
      >
         {orphan && (
            <p
               className="text-xs text-amber-700 dark:text-amber-400"
               title={tx('The text this comment pointed at is no longer in the document.')}
            >
               {tx('Content changed')} · “{root.anchor?.quote || root.anchor?.blockText}”
            </p>
         )}
         <CommentItem
            tx={tx}
            comment={root}
            documentId={documentId}
            workspaceId={workspaceId}
            run={run}
         />
         {replies.map((reply) => (
            <div key={reply.id} className="border-l-2 pl-2">
               <CommentItem
                  tx={tx}
                  comment={reply}
                  documentId={documentId}
                  workspaceId={workspaceId}
                  run={run}
               />
            </div>
         ))}
         {root.resolvedAt && (
            <p className="text-xs text-muted-foreground">
               {tx('Resolved by {name}', { name: root.resolvedBy?.name ?? '—' })}
            </p>
         )}
         {replying ? (
            <Composer
               tx={tx}
               documentId={documentId}
               workspaceId={workspaceId}
               placeholder={tx('Write a reply…')}
               autoFocus
               onCancel={() => setReplying(false)}
               onSubmit={async (text, mentionIds) => {
                  await run(
                     createDocumentComment(documentId, {
                        content: text,
                        mentionIds,
                        parentId: root.id,
                     })
                  );
                  setReplying(false);
               }}
            />
         ) : (
            <div className="flex gap-1">
               <Button size="xxs" variant="ghost" onClick={() => setReplying(true)}>
                  {tx('Reply')}
               </Button>
               <Button
                  size="xxs"
                  variant="ghost"
                  onClick={() =>
                     void run(
                        updateDocumentComment(documentId, root.id, { resolved: !root.resolvedAt })
                     )
                  }
               >
                  {root.resolvedAt ? tx('Reopen') : tx('Resolve')}
               </Button>
            </div>
         )}
      </div>
   );
}

function CommentItem({
   tx,
   comment,
   documentId,
   workspaceId,
   run,
}: {
   tx: Tx;
   comment: DocumentComment;
   documentId: string;
   workspaceId: string;
   run: (action: Promise<DocumentComment[]>) => Promise<void>;
}) {
   const locale = useUiPreferencesStore((state) => state.locale);
   const [editing, setEditing] = useState(false);
   return (
      <div className="flex min-w-0 flex-col gap-1">
         <div className="flex items-center gap-2 text-xs">
            <Avatar className="size-5 shrink-0">
               <AvatarImage src={comment.author.avatarUrl ?? undefined} alt={comment.author.name} />
               <AvatarFallback className="text-[10px] uppercase">
                  {comment.author.name.slice(0, 1)}
               </AvatarFallback>
            </Avatar>
            <span className="truncate font-medium">{comment.author.name}</span>
            <span className="shrink-0 text-muted-foreground">
               {relativeTime(comment.createdAt, Date.now(), locale)}
               {comment.updatedAt !== comment.createdAt &&
                  !comment.resolvedAt &&
                  ` · ${tx('edited')}`}
            </span>
         </div>
         {editing ? (
            <Composer
               tx={tx}
               documentId={documentId}
               workspaceId={workspaceId}
               initial={comment.content}
               initialMentions={comment.mentionIds}
               autoFocus
               submitLabel={tx('Save')}
               onCancel={() => setEditing(false)}
               onSubmit={async (text, mentionIds) => {
                  await run(
                     updateDocumentComment(documentId, comment.id, { content: text, mentionIds })
                  );
                  setEditing(false);
               }}
            />
         ) : (
            <p className="text-sm break-words whitespace-pre-wrap">{comment.content}</p>
         )}
         {comment.mine && !editing && (
            <div className="flex gap-1">
               <Button size="xxs" variant="ghost" onClick={() => setEditing(true)}>
                  {tx('Edit')}
               </Button>
               <Button
                  size="xxs"
                  variant="ghost"
                  onClick={() => {
                     if (window.confirm(tx('Delete this comment? Its replies are removed too.')))
                        void run(deleteDocumentComment(documentId, comment.id));
                  }}
               >
                  {tx('Delete')}
               </Button>
            </div>
         )}
      </div>
   );
}

function Composer({
   tx,
   documentId,
   workspaceId,
   placeholder,
   initial = '',
   initialMentions = [],
   autoFocus,
   submitLabel,
   onSubmit,
   onCancel,
}: {
   tx: Tx;
   documentId: string;
   workspaceId: string;
   placeholder?: string;
   initial?: string;
   initialMentions?: string[];
   autoFocus?: boolean;
   submitLabel?: string;
   onSubmit: (text: string, mentionIds: string[]) => Promise<void>;
   onCancel: () => void;
}) {
   const [draft, setDraft] = useState(initial);
   const [mentions, setMentions] = useState(initialMentions);
   const [sending, setSending] = useState(false);
   const [error, setError] = useState<string>();
   const submit = async () => {
      if (!draft.trim() || sending) return;
      setSending(true);
      setError(undefined);
      try {
         await onSubmit(draft.trim(), mentions);
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
         setSending(false);
      }
   };
   return (
      <div className="flex flex-col gap-2">
         <CommentMentions
            workspaceId={workspaceId}
            loadMembers={() => documentMentionOptions(documentId)}
            selected={mentions}
            onChange={setMentions}
            draft={draft}
            onDraftChange={setDraft}
         >
            <Textarea
               value={draft}
               autoFocus={autoFocus}
               placeholder={placeholder}
               aria-label={placeholder ?? tx('Comment')}
               className="min-h-16 text-sm"
               onChange={(event) => setDraft(event.target.value)}
               onKeyDown={(event) => {
                  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                     event.preventDefault();
                     void submit();
                  }
               }}
            />
         </CommentMentions>
         {error && (
            <p role="alert" className="text-xs text-destructive">
               {error}
            </p>
         )}
         <div className="flex justify-end gap-1">
            <Button size="xxs" variant="ghost" onClick={onCancel} disabled={sending}>
               {tx('Cancel')}
            </Button>
            <Button size="xxs" onClick={() => void submit()} disabled={!draft.trim() || sending}>
               {submitLabel ?? tx('Send')}
            </Button>
         </div>
      </div>
   );
}
