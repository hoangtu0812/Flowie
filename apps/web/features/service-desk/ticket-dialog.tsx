'use client';

import { Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
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
import { cn } from '@/lib/utils';
import { initialProjectId, type TicketPrefill } from './assistant-draft';
import { messages } from './messages.vi';
import { useTicketCategories } from './ticket-categories';
import {
   createTicket,
   updateTicket,
   type Ticket,
   type TicketPriority,
   type TicketProject,
} from './service-desk-api';

// Matches MAX_ATTACHMENT_BYTES in the API, so a file that would fail is caught before the ticket exists.
// VI: Bằng MAX_ATTACHMENT_BYTES của API, để file chắc chắn lỗi bị chặn trước khi tạo ticket.
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const fileSize = (bytes: number) =>
   bytes < 1024 * 1024
      ? `${Math.max(1, Math.round(bytes / 1024))} KB`
      : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

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
   initial,
   onClose,
   onSaved,
}: {
   workspaceId: string;
   projects: TicketProject[];
   ticket?: Ticket;
   /**
    * Values a new ticket starts with, such as the assistant's draft; ignored when editing.
    * VI: Giá trị khởi tạo cho ticket mới, ví dụ bản nháp của trợ lý; bỏ qua khi sửa ticket.
    */
   initial?: TicketPrefill;
   onClose: () => void;
   onSaved: (ticketId: string, uploadError?: string) => void;
}) {
   const tx = useMessages(messages);
   const [projectId, setProjectId] = useState(initialProjectId(projects, initial?.projectId));
   const [title, setTitle] = useState(ticket?.title ?? initial?.title ?? '');
   const [description, setDescription] = useState(
      ticket?.description ?? initial?.description ?? ''
   );
   const [priority, setPriority] = useState<TicketPriority>(ticket?.priority ?? 'NONE');
   const categories = useTicketCategories(workspaceId);
   const [categoryId, setCategoryId] = useState(ticket?.category?.id ?? '');
   // An archived category still shows on the ticket that has it, but cannot be picked again.
   // VI: Phân loại đã lưu trữ vẫn hiện trên ticket đang dùng, nhưng không chọn lại được.
   const categoryChoices =
      ticket?.category && !categories.some((item) => item.id === ticket.category?.id)
         ? [...categories, { ...ticket.category, archived: true }]
         : categories;
   const needsCategory = categories.length > 0 && !categoryId;
   const [files, setFiles] = useState<File[]>([]);
   const [fileError, setFileError] = useState<string>();
   const [dragging, setDragging] = useState(false);
   const fileInput = useRef<HTMLInputElement>(null);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const project = projects.find((item) => item.id === projectId);
   const draft = {
      title: title.trim(),
      description: description.trim() || null,
      priority,
      // Sent only when changed, so saving a ticket whose category was archived still works.
      // VI: Chỉ gửi khi đổi, để lưu ticket có phân loại đã lưu trữ vẫn được.
      ...(categoryId && categoryId !== ticket?.category?.id ? { categoryId } : {}),
   };

   const addFiles = (added: File[]) => {
      const tooBig = added.filter((file) => file.size > MAX_FILE_BYTES);
      setFileError(
         tooBig.length
            ? tx('{file} is larger than 10 MB.', {
                 file: tooBig.map((file) => file.name).join(', '),
              })
            : undefined
      );
      setFiles((current) => [...current, ...added.filter((file) => file.size <= MAX_FILE_BYTES)]);
   };
   // Pasted screenshots all arrive as "image.png", so each gets a distinct name.
   // VI: Ảnh dán từ clipboard đều tên "image.png", nên mỗi ảnh được đặt tên riêng.
   const paste = (event: React.ClipboardEvent) => {
      if (ticket) return;
      const pasted = Array.from(event.clipboardData.files);
      if (pasted.length === 0) return;
      event.preventDefault();
      const stamp = Date.now();
      addFiles(
         pasted.map((file, index) =>
            file.type.startsWith('image/')
               ? new File(
                    [file],
                    `screenshot-${stamp}-${index + 1}.${file.type.split('/')[1] || 'png'}`,
                    {
                       type: file.type,
                    }
                 )
               : file
         )
      );
   };

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
         <DialogContent className="sm:max-w-[560px]" onPaste={paste}>
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
               {categoryChoices.length > 0 && (
                  <div className="grid gap-1.5">
                     <Label htmlFor="ticket-category">{tx('Category')}</Label>
                     <Select value={categoryId} onValueChange={setCategoryId}>
                        <SelectTrigger id="ticket-category" className="w-full">
                           <SelectValue placeholder={tx('Choose a category')} />
                        </SelectTrigger>
                        <SelectContent>
                           {categoryChoices.map((item) => (
                              <SelectItem key={item.id} value={item.id} disabled={item.archived}>
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
                     <input
                        ref={fileInput}
                        id="ticket-files"
                        type="file"
                        multiple
                        className="sr-only"
                        onChange={(event) => {
                           addFiles(Array.from(event.target.files ?? []));
                           event.target.value = '';
                        }}
                     />
                     <button
                        type="button"
                        className={cn(
                           'flex flex-col items-center gap-1 rounded-md border border-dashed px-3 py-4 text-center text-sm text-muted-foreground transition-colors hover:bg-muted/50',
                           dragging && 'border-primary bg-muted/50'
                        )}
                        onClick={() => fileInput.current?.click()}
                        onDragOver={(event) => {
                           event.preventDefault();
                           setDragging(true);
                        }}
                        onDragLeave={() => setDragging(false)}
                        onDrop={(event) => {
                           event.preventDefault();
                           setDragging(false);
                           addFiles(Array.from(event.dataTransfer.files));
                        }}
                     >
                        <Paperclip className="size-4" />
                        <span>
                           {tx('Drop files here, paste a screenshot, or click to choose.')}
                        </span>
                        <span className="text-xs">
                           {tx('Images, PDF, Word, Excel and other files, up to 10 MB each.')}
                        </span>
                     </button>
                     {fileError && (
                        <p role="alert" className="text-sm text-destructive">
                           {fileError}
                        </p>
                     )}
                     {files.map((file, index) => (
                        <div
                           key={`${file.name}-${index}`}
                           className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
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
                                 setFiles((current) =>
                                    current.filter((_, position) => position !== index)
                                 )
                              }
                           >
                              <X className="size-3.5" />
                           </Button>
                        </div>
                     ))}
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
                  disabled={
                     saving || draft.title.length < 2 || (!ticket && !project) || needsCategory
                  }
               >
                  {tx(ticket ? 'Save' : 'Create ticket')}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
