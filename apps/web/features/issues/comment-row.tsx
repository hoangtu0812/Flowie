'use client';
import { useLocale } from '@/features/shared/use-locale';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { useRef, useState } from 'react';
import { Check, History, Paperclip, Pencil, Reply, Trash2, X } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { relativeTime } from '@/lib/time';
import { uploadAttachment } from '@/lib/attachments';
import { useCurrentUserId } from '@/components/common/my-issues/use-my-issues';
import { commentHistory, editComment, removeComment, type IssueComment } from './comments-api';
import { SubmissionGate } from '@/features/shared/submission-gate';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AgentBadge } from './agent-badge';

export function CommentRow({
   comment,
   workspaceId,
   onChange,
   onDelete,
   onReply,
}: {
   comment: IssueComment;
   workspaceId: string;
   onChange: (comment: IssueComment) => void;
   onDelete: () => void;
   onReply: () => void;
}) {
   const tx = useMessages(messages);
   const { locale } = useLocale();

   const accountId = useCurrentUserId();
   const own = accountId === comment.authorId;
   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState(comment.content);
   const [error, setError] = useState<string>();
   const [confirmDelete, setConfirmDelete] = useState(false);
   const [history, setHistory] = useState<Awaited<ReturnType<typeof commentHistory>>>();
   const [uploading, setUploading] = useState(false);
   const picker = useRef<HTMLInputElement>(null);
   const uploadGate = useRef(new SubmissionGate());
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   const action = async (operation: () => Promise<void>) => {
      setError(undefined);
      try {
         await operation();
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : 'The comment action failed.');
      }
   };
   return (
      <VStack
         as="article"
         gap={3}
         padding={4}
         className="min-w-0 rounded-lg border border-border/60 bg-background"
      >
         <HStack gap={2} wrap="wrap">
            <Avatar className="size-6 shrink-0">
               <AvatarImage src={comment.author.avatarUrl ?? undefined} alt={comment.author.name} />
               <AvatarFallback className="text-xs">
                  {comment.author.name.slice(0, 1)}
               </AvatarFallback>
            </Avatar>
            <Text weight="medium">{comment.author.name}</Text>
            {comment.agent && <AgentBadge agent={comment.agent} />}
            <Text type="supporting">
               {relativeTime(comment.createdAt, Date.now(), locale)}
               {comment.version > 1 ? tx(' · edited') : ''}
            </Text>
            <HStack gap={0.5} className="ml-auto text-muted-foreground">
               {!comment.parentCommentId && (
                  <Button
                     label={tx('Reply')}
                     tooltip={tx('Reply')}
                     icon={<Reply className="size-4" />}
                     isIconOnly
                     size="sm"
                     variant="ghost"
                     onClick={onReply}
                  />
               )}
               {own && (
                  <>
                     <Button
                        label={tx('Edit comment')}
                        tooltip={tx('Edit comment')}
                        icon={<Pencil className="size-4" />}
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                           setDraft(comment.content);
                           setEditing(true);
                        }}
                     />
                     <Button
                        label={tx('Delete comment')}
                        tooltip={tx('Delete comment')}
                        icon={<Trash2 className="size-4" />}
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        onClick={() => setConfirmDelete(true)}
                     />
                  </>
               )}
               <Button
                  label={history ? tx('Hide comment history') : tx('Comment history')}
                  tooltip={history ? tx('Hide comment history') : tx('Comment history')}
                  icon={<History className="size-4" />}
                  isIconOnly
                  aria-pressed={Boolean(history)}
                  size="sm"
                  variant="ghost"
                  clickAction={() =>
                     action(async () => {
                        setHistory(
                           history ? undefined : await commentHistory(workspaceId, comment.id)
                        );
                     })
                  }
               />
               {own && (
                  <Button
                     label={tx('Attach to comment')}
                     tooltip={tx('Attach to comment')}
                     icon={<Paperclip className="size-4" />}
                     isIconOnly
                     size="sm"
                     variant="ghost"
                     isLoading={uploading}
                     onClick={() => picker.current?.click()}
                  />
               )}
            </HStack>
         </HStack>
         {editing ? (
            <>
               <TextArea label={tx('Edit comment')} value={draft} onChange={setDraft} />
               <HStack gap={2}>
                  <Button
                     label={tx('Save comment')}
                     tooltip={tx('Save comment')}
                     icon={<Check className="size-4" />}
                     isIconOnly
                     variant="primary"
                     size="sm"
                     isDisabled={!draft.trim()}
                     clickAction={() =>
                        action(async () => {
                           onChange(await editComment(workspaceId, comment, draft));
                           setEditing(false);
                        })
                     }
                  />
                  <Button
                     label={tx('Cancel comment editing')}
                     tooltip={tx('Cancel comment editing')}
                     icon={<X className="size-4" />}
                     isIconOnly
                     variant="ghost"
                     size="sm"
                     onClick={() => setEditing(false)}
                  />
               </HStack>
            </>
         ) : (
            <MarkdownPreview content={comment.content} appearance="issue" />
         )}
         {error && <Text role="alert">{error}</Text>}
         {confirmDelete && (
            <HStack gap={2}>
               <Text>{tx('Delete this comment? Replies remain visible.')}</Text>
               <Button
                  label={tx('Confirm delete comment')}
                  tooltip={tx('Confirm delete comment')}
                  icon={<Trash2 className="size-4" />}
                  isIconOnly
                  variant="destructive"
                  size="sm"
                  clickAction={() =>
                     action(async () => {
                        await removeComment(workspaceId, comment.id);
                        onDelete();
                     })
                  }
               />
               <Button
                  label={tx('Cancel deletion')}
                  tooltip={tx('Cancel deletion')}
                  icon={<X className="size-4" />}
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
               />
            </HStack>
         )}
         {history?.map((revision) => (
            <VStack key={revision.version} gap={1}>
               <Text>
                  {tx('v')}
                  {revision.version} · {relativeTime(revision.createdAt, Date.now(), locale)}
               </Text>
               <Text className="whitespace-pre-wrap">{revision.content}</Text>
            </VStack>
         ))}
         {comment.attachments.map((file) => (
            <a
               key={file.id}
               href={`${api}/attachments/${encodeURIComponent(file.id)}/download`}
               target="_blank"
               rel="noreferrer"
            >
               {file.filename}
            </a>
         ))}
         <input
            ref={picker}
            type="file"
            multiple
            hidden
            aria-label={tx('Select comment attachments')}
            onChange={(event) => {
               const files = Array.from(event.target.files ?? []);
               event.target.value = '';
               void uploadGate.current.run(() =>
                  action(async () => {
                     setUploading(true);
                     let next = comment;
                     try {
                        for (const file of files) {
                           const attachment = await uploadAttachment(
                              workspaceId,
                              'comment',
                              comment.id,
                              file
                           );
                           next = { ...next, attachments: [...next.attachments, attachment] };
                           onChange(next);
                        }
                     } finally {
                        setUploading(false);
                     }
                  })
               );
            }}
         />
      </VStack>
   );
}
