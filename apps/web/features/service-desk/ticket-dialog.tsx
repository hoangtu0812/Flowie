'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import { uploadAttachment } from '@/lib/attachments';
import { messages } from './messages.vi';
import {
   createTicket,
   updateTicket,
   type Ticket,
   type TicketPriority,
   type TicketProject,
} from './service-desk-api';

export const PRIORITY_LABELS = {
   NONE: 'No priority',
   LOW: 'Low',
   MEDIUM: 'Medium',
   HIGH: 'High',
   URGENT: 'Urgent',
} as const;

/**
 * Creates a ticket, or edits its wording when `ticket` is given. Files upload after the ticket
 * exists, so a failed upload must not offer a retry here: that would create the ticket twice.
 * The failure goes to `onSaved` instead, and the file can be added again from the ticket.
 * VI: Tạo ticket, hoặc sửa nội dung khi có `ticket`. Tệp được tải lên sau khi ticket đã tồn tại,
 * VI: nên lỗi tải lên không được thử lại tại đây vì sẽ tạo trùng ticket. Lỗi được chuyển cho
 * VI: `onSaved`, và tệp có thể thêm lại từ chi tiết ticket.
 */
export function TicketDialog({
   workspaceId,
   projects,
   ticket,
   onClose,
   onSaved,
}: {
   workspaceId: string;
   projects: TicketProject[];
   ticket?: Ticket;
   onClose: () => void;
   onSaved: (ticketId: string, uploadError?: string) => void;
}) {
   const tx = useMessages(messages);
   const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
   const [title, setTitle] = useState(ticket?.title ?? '');
   const [description, setDescription] = useState(ticket?.description ?? '');
   const [priority, setPriority] = useState<TicketPriority>(ticket?.priority ?? 'NONE');
   const [files, setFiles] = useState<File[]>([]);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const project = projects.find((item) => item.id === projectId);
   const draft = { title: title.trim(), description: description.trim() || null, priority };

   const submit = async () => {
      setSaving(true);
      setError(undefined);
      try {
         if (ticket) {
            await updateTicket(workspaceId, ticket.id, draft);
            onSaved(ticket.id);
            return;
         }
         if (!project) return;
         const created = await createTicket(workspaceId, project, draft);
         let uploadError: string | undefined;
         for (const file of files) {
            try {
               await uploadAttachment(workspaceId, 'ticket', created.id, file);
            } catch (caught) {
               uploadError = tx(
                  'The ticket was created, but {file} could not be uploaded: {reason}',
                  { file: file.name, reason: caught instanceof Error ? caught.message : '' }
               );
            }
         }
         onSaved(created.id, uploadError);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not save the ticket.');
         setSaving(false);
      }
   };

   return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
         <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
               <DialogTitle>{tx(ticket ? 'Edit ticket' : 'New ticket')}</DialogTitle>
               <DialogDescription>
                  {tx('Add the details the team needs to help you.')}
               </DialogDescription>
            </DialogHeader>
            {!ticket && projects.length === 0 && (
               <p className="text-sm text-muted-foreground">
                  {tx(
                     'No project accepts tickets yet. Ask a project lead to turn on Service Desk.'
                  )}
               </p>
            )}
            <div className="grid gap-3">
               {!ticket && (
                  <div className="grid gap-1.5">
                     <Label htmlFor="ticket-project">{tx('Project')}</Label>
                     <Select value={projectId} onValueChange={setProjectId}>
                        <SelectTrigger id="ticket-project" className="w-full">
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {projects.map((item) => (
                              <SelectItem key={item.id} value={item.id}>
                                 {item.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
               )}
               <div className="grid gap-1.5">
                  <Label htmlFor="ticket-title">{tx('Title')}</Label>
                  <Input
                     id="ticket-title"
                     value={title}
                     maxLength={500}
                     placeholder={tx('What do you need help with?')}
                     onChange={(event) => setTitle(event.target.value)}
                  />
               </div>
               <div className="grid gap-1.5">
                  <Label htmlFor="ticket-description">{tx('Description')}</Label>
                  <Textarea
                     id="ticket-description"
                     value={description}
                     maxLength={10000}
                     rows={5}
                     onChange={(event) => setDescription(event.target.value)}
                  />
               </div>
               <div className="grid gap-1.5">
                  <Label htmlFor="ticket-priority">{tx('Priority')}</Label>
                  <Select
                     value={priority}
                     onValueChange={(value) => setPriority(value as TicketPriority)}
                  >
                     <SelectTrigger id="ticket-priority" className="w-full">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {(Object.keys(PRIORITY_LABELS) as TicketPriority[]).map((value) => (
                           <SelectItem key={value} value={value}>
                              {tx(PRIORITY_LABELS[value])}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>
               {!ticket && (
                  <div className="grid gap-1.5">
                     <Label htmlFor="ticket-files">{tx('Attachments')}</Label>
                     <Input
                        id="ticket-files"
                        type="file"
                        multiple
                        onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                     />
                  </div>
               )}
               {error && (
                  <p role="alert" className="text-sm text-destructive">
                     {error}
                  </p>
               )}
            </div>
            <DialogFooter>
               <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                  {tx('Cancel')}
               </Button>
               <Button
                  type="button"
                  onClick={() => void submit()}
                  disabled={saving || draft.title.length < 2 || (!ticket && !project)}
               >
                  {tx(ticket ? 'Save' : 'Create ticket')}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
