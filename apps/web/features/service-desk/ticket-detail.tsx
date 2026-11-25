'use client';

import { ChevronLeft, Paperclip, X } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import type { TeamMember, WorkspaceTeam } from '@/features/teams/team-types';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { fileSize, MAX_FILE_BYTES, pastedFiles } from './ticket-files';
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
   supportTeams = [],
   onChanged,
   onClose,
   onEdit,
   onArchived,
}: {
   workspaceId: string;
   ticket: Ticket;
   canHandle: boolean;
   members: TeamMember[];
   /** Teams with a support tier, which this ticket can move to. */
   /** VI: Các team có cấp hỗ trợ, nơi ticket này có thể được chuyển tới. */
   supportTeams?: WorkspaceTeam[];
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
   const [attached, setAttached] = useState<File[]>([]);
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string>();
   const [pending, setPending] = useState<TicketDialogAction>();
   const [moveTeam, setMoveTeam] = useState('');
   const [moveAssignee, setMoveAssignee] = useState(UNASSIGNED);
   const targets = supportTeams
      .filter((team) => team.id !== ticket.teamId)
      .sort((a, b) => (a.supportTier ?? 0) - (b.supportTier ?? 0) || a.name.localeCompare(b.name));
   const target = targets.find((team) => team.id === moveTeam);
   const fileInput = useRef<HTMLInputElement>(null);
   const replyFileInput = useRef<HTMLInputElement>(null);

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
   // Files go up first, so a failed upload keeps the reply text for another try.
   // VI: Tệp được tải lên trước, nên nếu tải lỗi thì nội dung trả lời vẫn còn để gửi lại.
   const send = () =>
      change(async () => {
         for (const file of attached) {
            await uploadAttachment(workspaceId, 'ticket', ticket.id, file);
            setAttached((current) => current.filter((item) => item !== file));
         }
         if (reply.trim()) await sendTicketMessage(workspaceId, ticket.id, reply.trim());
         setReply('');
         await loadConversation();
      });
   const attach = (added: File[]) => {
      const tooBig = added.filter((file) => file.size > MAX_FILE_BYTES);
      setError(
         tooBig.length
            ? tx('{file} is larger than 10 MB.', {
                 file: tooBig.map((file) => file.name).join(', '),
              })
            : undefined
      );
      setAttached((current) => [
         ...current,
         ...added.filter((file) => file.size <= MAX_FILE_BYTES),
      ]);
   };
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
               {ticket.identifier}
            </Text>
            <Badge variant="secondary">{tx(statusLabel(ticket.ticketStatus, canHandle))}</Badge>
         </HStack>
         <div className="min-h-0 flex-1 overflow-y-auto">
            <VStack gap={6} className="mx-auto w-full max-w-3xl p-4 sm:p-6">
               <VStack gap={1}>
                  <h2 className="text-lg font-semibold break-words">{ticket.title}</h2>
                  <Text type="supporting">
                     {[
                        ticket.category?.name,
                        ticket.project?.name ?? ticket.team.name,
                        canHandle &&
                           (ticket.team.supportTier
                              ? tx('Tier {tier} · {team}', {
                                   tier: ticket.team.supportTier,
                                   team: ticket.team.name,
                                })
                              : ticket.project && ticket.team.name),
                        tx('Created by {name}', { name: ticket.createdBy.name }),
                        ticket.assignee && tx('Assigned to {name}', { name: ticket.assignee.name }),
                        when(ticket.createdAt),
                     ]
                        .filter(Boolean)
                        .join(' · ')}
                  </Text>
               </VStack>
               {canHandle && ticket.reopenPending && converted && (
                  <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                     {tx(
                        'The requester reopened this ticket. Move {issue} back to work, or mark the ticket as resolved.',
                        { issue: converted.identifier }
                     )}
                  </p>
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
               {canHandle && editable && targets.length > 0 && (
                  <div className="grid gap-1.5 rounded-lg border p-3">
                     <Label htmlFor="ticket-move-team">{tx('Escalate or hand over')}</Label>
                     <div className="flex flex-wrap items-center gap-2">
                        <Select
                           value={moveTeam}
                           disabled={busy}
                           onValueChange={(value) => {
                              setMoveTeam(value);
                              setMoveAssignee(UNASSIGNED);
                           }}
                        >
                           <SelectTrigger id="ticket-move-team" className="w-56">
                              <SelectValue placeholder={tx('Choose a team')} />
                           </SelectTrigger>
                           <SelectContent>
                              {targets.map((team) => (
                                 <SelectItem key={team.id} value={team.id}>
                                    {tx('Tier {tier} · {team}', {
                                       tier: team.supportTier ?? '',
                                       team: team.name,
                                    })}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                        <Select
                           value={moveAssignee}
                           disabled={busy || !target}
                           onValueChange={setMoveAssignee}
                        >
                           <SelectTrigger aria-label={tx('Technician')} className="w-56">
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value={UNASSIGNED}>{tx('Whole team')}</SelectItem>
                              {target?.members.map((member) => (
                                 <SelectItem key={member.id} value={member.id}>
                                    {member.name}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                        <Button
                           type="button"
                           size="sm"
                           disabled={busy || !target}
                           onClick={() =>
                              void change(() =>
                                 updateTicket(workspaceId, ticket.id, {
                                    teamId: moveTeam,
                                    ...(moveAssignee !== UNASSIGNED
                                       ? { assigneeId: moveAssignee }
                                       : {}),
                                 })
                              )
                           }
                        >
                           {tx('Move ticket')}
                        </Button>
                     </div>
                     <Text type="supporting">
                        {tx(
                           'The ticket leaves your queue and goes to the chosen team, or straight to one technician.'
                        )}
                     </Text>
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
               {ticket.description && (
                  <Section title={tx('Description')}>
                     <p className="rounded-lg border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">
                        {ticket.description}
                     </p>
                  </Section>
               )}
               <Section
                  title={`${tx('Attachments')}${files.length ? ` (${files.length})` : ''}`}
                  action={
                     <>
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
                     </>
                  }
               >
                  {files.map((file) => (
                     <a
                        key={file.id}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm break-all hover:bg-muted/50"
                        href={`${api}/attachments/${encodeURIComponent(file.id)}/download`}
                        target="_blank"
                        rel="noreferrer"
                     >
                        {file.mimeType.startsWith('image/') ? (
                           // eslint-disable-next-line @next/next/no-img-element -- authenticated download URL
                           <img
                              src={`${api}/attachments/${encodeURIComponent(file.id)}/download`}
                              alt=""
                              className="size-10 shrink-0 rounded object-cover"
                           />
                        ) : (
                           <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                        )}
                        {file.filename}
                     </a>
                  ))}
               </Section>
               <Section title={`${tx('Messages')}${thread.length ? ` (${thread.length})` : ''}`}>
                  {thread.length === 0 && <Text type="supporting">{tx('No messages yet.')}</Text>}
                  {thread.map((message) => (
                     <HStack key={message.id} gap={3} className="items-start">
                        <Avatar className="size-7 shrink-0">
                           <AvatarFallback className="text-xs">
                              {message.author.name.charAt(0).toUpperCase()}
                           </AvatarFallback>
                        </Avatar>
                        <VStack gap={1} className="min-w-0 flex-1 rounded-lg bg-muted/40 px-3 py-2">
                           <Text type="supporting">
                              <span className="font-medium text-foreground">
                                 {message.author.name}
                              </span>{' '}
                              · {when(message.createdAt)}
                           </Text>
                           <p className="text-sm break-words whitespace-pre-wrap">
                              {message.content}
                           </p>
                        </VStack>
                     </HStack>
                  ))}
               </Section>
            </VStack>
         </div>
         {/* pr-20 keeps the send button clear of the floating assistant button. */}
         {/* VI: pr-20 chừa chỗ để nút gửi không bị nút trợ lý nổi che. */}
         <div className="shrink-0 border-t">
            <VStack gap={2} className="mx-auto w-full max-w-3xl p-4 pr-20">
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
                     {attached.map((file, index) => (
                        <HStack
                           key={`${file.name}-${index}`}
                           gap={2}
                           className="items-center rounded-md border px-3 py-1.5 text-sm"
                        >
                           <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                           <span className="min-w-0 flex-1 truncate">{file.name}</span>
                           <span className="shrink-0 text-xs text-muted-foreground">
                              {fileSize(file.size)}
                           </span>
                           <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="size-6"
                              aria-label={tx('Remove {file}', { file: file.name })}
                              onClick={() =>
                                 setAttached((current) =>
                                    current.filter((_, position) => position !== index)
                                 )
                              }
                           >
                              <X className="size-3.5" />
                           </Button>
                        </HStack>
                     ))}
                     <HStack gap={2} className="items-end">
                        <Button
                           type="button"
                           variant="ghost"
                           size="icon"
                           disabled={busy}
                           aria-label={tx('Attach files to the reply')}
                           onClick={() => replyFileInput.current?.click()}
                        >
                           <Paperclip className="size-4" />
                        </Button>
                        <input
                           ref={replyFileInput}
                           type="file"
                           multiple
                           hidden
                           aria-label={tx('Attach files to the reply')}
                           onChange={(event) => {
                              attach(Array.from(event.target.files ?? []));
                              event.target.value = '';
                           }}
                        />
                        <Textarea
                           value={reply}
                           rows={2}
                           maxLength={10000}
                           aria-label={tx('Write a reply')}
                           placeholder={tx('Write a reply or paste a screenshot')}
                           className="min-h-0 resize-none"
                           onChange={(event) => setReply(event.target.value)}
                           onPaste={(event) => {
                              const pasted = pastedFiles(event);
                              if (pasted.length === 0) return;
                              event.preventDefault();
                              attach(pasted);
                           }}
                        />
                        <Button
                           type="button"
                           disabled={busy || (!reply.trim() && attached.length === 0)}
                           onClick={() => void send()}
                        >
                           {tx('Send')}
                        </Button>
                     </HStack>
                  </>
               )}
            </VStack>
         </div>
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

function Section({
   title,
   action,
   children,
}: {
   title: string;
   action?: React.ReactNode;
   children: React.ReactNode;
}) {
   return (
      <VStack gap={2}>
         <HStack gap={2} className="min-h-8 items-center justify-between">
            <Text type="label">{title}</Text>
            {action}
         </HStack>
         {children}
      </VStack>
   );
}
