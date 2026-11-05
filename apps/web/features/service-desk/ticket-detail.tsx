'use client';

import { ChevronLeft, Paperclip } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import type { TeamMember } from '@/components/common/teams/team-types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useMessages } from '@/features/shared/use-messages';
import { uploadAttachment, type Attachment } from '@/lib/attachments';
import { parseInstant } from '@/lib/time';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { messages } from './messages.vi';
import { TicketActionDialog, type TicketDialogAction } from './ticket-action-dialog';
import {
   api,
   archiveTicket,
   convertTicket,
   listTicketFiles,
   listTicketMessages,
   sendTicketMessage,
   transitionTicket,
   updateTicket,
   type Ticket,
   type TicketMessage,
   type TicketStatus,
} from './service-desk-api';

export const STATUS_LABELS = {
   received: 'Received',
   waiting_for_you: 'Waiting for you',
   in_progress: 'In progress',
   done: 'Done',
   canceled: 'Canceled',
   declined: 'Declined',
} as const;

const UNASSIGNED = 'unassigned';

/** One status label; in the queue, "waiting" means waiting on the requester, not the reader. */
/** VI: Nhãn trạng thái; ở hàng đợi, "đang chờ" nghĩa là chờ người yêu cầu, không phải người đọc. */
export const statusLabel = (status: TicketStatus, inQueue: boolean) =>
   inQueue && status === 'waiting_for_you' ? 'Waiting for requester' : STATUS_LABELS[status];

/**
 * Reads and answers one ticket. `canHandle` comes from the ticket being in the team queue, the
 * only response that carries issue data, and only decides which buttons show: the API enforces
 * the same rule. The parent keys this by ticket id, so state never leaks between tickets.
 * VI: Đọc và trả lời một ticket. `canHandle` lấy từ việc ticket có trong hàng đợi của team, kết
 * VI: quả duy nhất kèm dữ liệu Issue, và chỉ quyết định nút nào hiện: API áp cùng quy tắc đó.
 * VI: Component cha đặt key theo id ticket nên state không lẫn giữa các ticket.
 */
export function TicketDetail({
   workspaceId,
   ticket,
   canHandle,
   members,
   onChanged,
   onClose,
   onEdit,
   onArchived,
}: {
   workspaceId: string;
   ticket: Ticket;
   canHandle: boolean;
   members: TeamMember[];
   onChanged: () => Promise<void>;
   onClose: () => void;
   onEdit: () => void;
   onArchived: () => void;
}) {
   const tx = useMessages(messages);
   const locale = useUiPreferencesStore((state) => state.locale);
   const { orgId } = useParams<{ orgId: string }>();
   const [thread, setThread] = useState<TicketMessage[]>([]);
   const [files, setFiles] = useState<Attachment[]>([]);
   const [reply, setReply] = useState('');
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string>();
   const [pending, setPending] = useState<TicketDialogAction>();
   const fileInput = useRef<HTMLInputElement>(null);

   const loadConversation = useCallback(async () => {
      const [nextThread, nextFiles] = await Promise.all([
         listTicketMessages(workspaceId, ticket.id),
         listTicketFiles(workspaceId, ticket.id),
      ]);
      setThread(nextThread);
      setFiles(nextFiles);
   }, [ticket.id, workspaceId]);

   // Messages, files and decisions all move `updatedAt`, so a reloaded list is the only signal needed.
   // VI: Tin nhắn, tệp và các quyết định đều đổi `updatedAt`, nên chỉ cần tín hiệu từ danh sách.
   useEffect(() => {
      loadConversation().catch((caught: unknown) =>
         setError(caught instanceof Error ? caught.message : 'Could not load the ticket.')
      );
   }, [loadConversation, ticket.updatedAt]);

   const act = async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(undefined);
      try {
         await action();
         return true;
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not update the ticket.');
         return false;
      } finally {
         setBusy(false);
      }
   };
   const change = (action: () => Promise<unknown>) =>
      act(async () => {
         await action();
         await onChanged();
      });
   const send = () =>
      change(async () => {
         await sendTicketMessage(workspaceId, ticket.id, reply.trim());
         setReply('');
         await loadConversation();
      });
   const upload = (selected: File[]) =>
      act(async () => {
         for (const file of selected)
            await uploadAttachment(workspaceId, 'ticket', ticket.id, file);
         await loadConversation();
      });

   const confirm = async (message: string) => {
      if (pending === 'archive') {
         await archiveTicket(workspaceId, ticket.id);
         onArchived();
         return;
      }
      if (pending) await transitionTicket(workspaceId, ticket.id, pending, message);
      await loadConversation();
      await onChanged();
      setPending(undefined);
   };

   const when = (value: string) => parseInstant(value).toLocaleString(locale);
   const converted = canHandle && ticket.convertedIssue;
   const editable = ticket.status === 'open';
   const closed = ['done', 'canceled', 'declined'].includes(ticket.ticketStatus);
   // A decline or an issue the team canceled stays open to replies, since it cannot be reopened.
   // VI: Ticket bị từ chối hoặc Issue bị team huỷ vẫn nhận phản hồi, vì không tự mở lại được.
   const requesterReopens =
      !canHandle && (ticket.ticketStatus === 'done' || ticket.status === 'canceled');

   return (
      <VStack className="h-full min-h-0 w-full">
         <HStack gap={2} className="h-10 shrink-0 items-center border-b px-4">
            <Button
               type="button"
               variant="ghost"
               size="icon"
               className="size-7"
               aria-label={tx('Close')}
               onClick={onClose}
            >
               <ChevronLeft className="size-4" />
            </Button>
            <Text type="label" className="min-w-0 flex-1 truncate">
               {ticket.title}
            </Text>
            <Badge variant="secondary">{tx(statusLabel(ticket.ticketStatus, canHandle))}</Badge>
         </HStack>
         <VStack gap={4} className="min-h-0 flex-1 overflow-y-auto p-4">
            <Text type="supporting">
               {[
                  ticket.identifier,
                  ticket.project?.name ?? ticket.team.name,
                  tx('Created by {name}', { name: ticket.createdBy.name }),
                  ticket.assignee && tx('Assigned to {name}', { name: ticket.assignee.name }),
                  when(ticket.createdAt),
               ]
                  .filter(Boolean)
                  .join(' · ')}
            </Text>
            {ticket.description && (
               <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
            )}
            {canHandle && ticket.reopenPending && converted && (
               <Text type="supporting">
                  {tx(
                     'The requester reopened this ticket. Move {issue} back to work, or mark the ticket as resolved.',
                     { issue: converted.identifier }
                  )}
               </Text>
            )}
            {canHandle && editable && (
               <div className="grid max-w-xs gap-1.5">
                  <Label htmlFor="ticket-assignee">{tx('Assignee')}</Label>
                  <Select
                     value={ticket.assignee?.id ?? UNASSIGNED}
                     disabled={busy}
                     onValueChange={(value) =>
                        void change(() =>
                           updateTicket(workspaceId, ticket.id, {
                              assigneeId: value === UNASSIGNED ? null : value,
                           })
                        )
                     }
                  >
                     <SelectTrigger id="ticket-assignee" className="w-full">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value={UNASSIGNED}>{tx('Unassigned')}</SelectItem>
                        {members.map((member) => (
                           <SelectItem key={member.id} value={member.id}>
                              {member.name}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>
            )}
            <div className="flex flex-wrap gap-2">
               {converted && (
                  <Button asChild variant="outline" size="sm">
                     <Link href={`/${orgId}/issue/${converted.identifier}`}>
                        {converted.identifier}
                     </Link>
                  </Button>
               )}
               {canHandle && editable && (
                  <Button
                     type="button"
                     size="sm"
                     disabled={busy}
                     onClick={() => void change(() => convertTicket(workspaceId, ticket.id))}
                  >
                     {tx('Convert to issue')}
                  </Button>
               )}
               {canHandle && (editable || ticket.reopenPending) && (
                  <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     disabled={busy}
                     onClick={() => setPending('resolve')}
                  >
                     {tx('Mark as resolved')}
                  </Button>
               )}
               {canHandle && editable && (
                  <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     disabled={busy}
                     onClick={() => setPending('decline')}
                  >
                     {tx('Decline')}
                  </Button>
               )}
               {canHandle && closed && (
                  <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     disabled={busy}
                     onClick={() => setPending('reopen')}
                  >
                     {tx('Reopen')}
                  </Button>
               )}
               {editable && (
                  <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     disabled={busy}
                     onClick={onEdit}
                  >
                     {tx('Edit')}
                  </Button>
               )}
               {!canHandle && editable && (
                  <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     disabled={busy}
                     onClick={() => setPending('cancel')}
                  >
                     {tx('Cancel request')}
                  </Button>
               )}
               {canHandle && (
                  <Button
                     type="button"
                     variant="outline"
                     size="sm"
                     disabled={busy}
                     onClick={() => setPending('archive')}
                  >
                     {tx('Archive')}
                  </Button>
               )}
            </div>
            <VStack gap={2}>
               <HStack gap={2} className="items-center justify-between">
                  <Text type="label">{tx('Attachments')}</Text>
                  <Button
                     type="button"
                     variant="ghost"
                     size="sm"
                     disabled={busy}
                     onClick={() => fileInput.current?.click()}
                  >
                     <Paperclip className="size-3.5" />
                     {tx('Add file')}
                  </Button>
                  <input
                     ref={fileInput}
                     type="file"
                     multiple
                     hidden
                     aria-label={tx('Add file')}
                     onChange={(event) => {
                        void upload(Array.from(event.target.files ?? []));
                        event.target.value = '';
                     }}
                  />
               </HStack>
               {files.map((file) => (
                  <a
                     key={file.id}
                     className="text-sm underline break-all"
                     href={`${api}/attachments/${encodeURIComponent(file.id)}/download`}
                     target="_blank"
                     rel="noreferrer"
                  >
                     {file.filename}
                  </a>
               ))}
            </VStack>
            <VStack gap={2}>
               <Text type="label">{tx('Messages')}</Text>
               {thread.length === 0 && <Text type="supporting">{tx('No messages yet.')}</Text>}
               {thread.map((message) => (
                  <div key={message.id} className="rounded-md border p-3">
                     <Text type="supporting">
                        {message.author.name} · {when(message.createdAt)}
                     </Text>
                     <p className="mt-1 text-sm whitespace-pre-wrap">{message.content}</p>
                  </div>
               ))}
            </VStack>
         </VStack>
         <VStack gap={2} className="shrink-0 border-t p-4">
            {error && (
               <p role="alert" className="text-sm text-destructive">
                  {error}
               </p>
            )}
            {requesterReopens ? (
               <HStack gap={2} className="items-center justify-between">
                  <Text type="supporting">{tx('This ticket is closed.')}</Text>
                  <Button type="button" size="sm" onClick={() => setPending('reopen')}>
                     {tx('Still not fixed')}
                  </Button>
               </HStack>
            ) : (
               <>
                  <Textarea
                     value={reply}
                     rows={2}
                     maxLength={10000}
                     aria-label={tx('Write a reply')}
                     placeholder={tx('Write a reply')}
                     onChange={(event) => setReply(event.target.value)}
                  />
                  <Button
                     type="button"
                     size="sm"
                     className="self-end"
                     disabled={busy || !reply.trim()}
                     onClick={() => void send()}
                  >
                     {tx('Send')}
                  </Button>
               </>
            )}
         </VStack>
         {pending && (
            <TicketActionDialog
               action={pending}
               onClose={() => setPending(undefined)}
               onConfirm={confirm}
            />
         )}
      </VStack>
   );
}
