'use client';
import { useLocale } from '@/features/shared/use-locale';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { useRef, useState } from 'react';
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
      <VStack as="article" gap={2} paddingBlock={3}>
         <HStack gap={2}>
            <Text weight="medium">{comment.author.name}</Text>
            <Text type="supporting">
               {relativeTime(comment.createdAt, Date.now(), locale)}
               {comment.version > 1 ? tx(' · edited') : ''}
            </Text>
         </HStack>
         {editing ? (
            <>
               <TextArea label={tx('Edit comment')} value={draft} onChange={setDraft} />
               <HStack gap={2}>
                  <Button
                     label={tx('Save comment')}
                     isDisabled={!draft.trim()}
                     clickAction={() =>
                        action(async () => {
                           onChange(await editComment(workspaceId, comment, draft));
                           setEditing(false);
                        })
                     }
                  />
                  <Button label={tx('Cancel comment editing')} onClick={() => setEditing(false)} />
               </HStack>
            </>
         ) : (
            <MarkdownPreview content={comment.content} />
         )}
         <HStack gap={2} wrap="wrap">
            {!comment.parentCommentId && <Button label={tx('Reply')} size="sm" onClick={onReply} />}
            {own && (
               <>
                  <Button
                     label={tx('Edit comment')}
                     size="sm"
                     onClick={() => {
                        setDraft(comment.content);
                        setEditing(true);
                     }}
                  />
                  <Button
                     label={tx('Delete comment')}
                     size="sm"
                     onClick={() => setConfirmDelete(true)}
                  />
               </>
            )}
            <Button
               label={history ? tx('Hide comment history') : tx('Comment history')}
               size="sm"
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
                  size="sm"
                  isLoading={uploading}
                  onClick={() => picker.current?.click()}
               />
            )}
         </HStack>
         {error && <Text role="alert">{error}</Text>}
         {confirmDelete && (
            <HStack gap={2}>
               <Text>{tx('Delete this comment? Replies remain visible.')}</Text>
               <Button
                  label={tx('Confirm delete comment')}
                  variant="destructive"
                  clickAction={() =>
                     action(async () => {
                        await removeComment(workspaceId, comment.id);
                        onDelete();
                     })
                  }
               />
               <Button label={tx('Cancel deletion')} onClick={() => setConfirmDelete(false)} />
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
