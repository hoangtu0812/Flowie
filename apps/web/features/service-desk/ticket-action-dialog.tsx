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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';
import type { TicketAction } from './service-desk-api';

export type TicketDialogAction = TicketAction | 'archive';

const COPY = {
   resolve: {
      title: 'Mark as resolved',
      description: 'This closes the ticket. The requester can reopen it if the problem remains.',
      label: 'Note for the requester (optional)',
      confirm: 'Mark as resolved',
      required: false,
   },
   decline: {
      title: 'Decline this ticket',
      description: 'The requester reads your reason in the ticket.',
      label: 'Reason',
      confirm: 'Decline',
      required: true,
   },
   cancel: {
      title: 'Cancel this request',
      description: 'The team stops working on it. You can reopen it later.',
      label: 'Reason (optional)',
      confirm: 'Cancel request',
      required: false,
   },
   reopen: {
      title: 'Reopen this ticket',
      description: 'The ticket returns to the queue and the team is told.',
      label: 'What still needs attention?',
      confirm: 'Reopen',
      required: true,
   },
   archive: {
      title: 'Archive this ticket',
      description: 'It leaves every list and its notifications leave the Inbox.',
      label: undefined,
      confirm: 'Archive',
      required: false,
   },
} as const;

/**
 * Confirms a ticket decision and collects its text, which becomes a message in the ticket. The
 * API repeats every rule here. A failure stays in the dialog so the typed text is not lost.
 * VI: Xác nhận một quyết định trên ticket và nhận nội dung, nội dung trở thành tin nhắn trong
 * VI: ticket. API kiểm tra lại mọi quy tắc tại đây. Lỗi hiện ngay trong hộp thoại để không mất
 * VI: nội dung đã nhập.
 */
export function TicketActionDialog({
   action,
   onClose,
   onConfirm,
}: {
   action: TicketDialogAction;
   onClose: () => void;
   onConfirm: (message: string) => Promise<void>;
}) {
   const tx = useMessages(messages);
   const copy = COPY[action];
   const [message, setMessage] = useState('');
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string>();

   const confirm = async () => {
      setBusy(true);
      setError(undefined);
      try {
         await onConfirm(message.trim());
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not update the ticket.');
         setBusy(false);
      }
   };

   return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
         <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
               <DialogTitle>{tx(copy.title)}</DialogTitle>
               <DialogDescription>{tx(copy.description)}</DialogDescription>
            </DialogHeader>
            {copy.label && (
               <div className="grid gap-1.5">
                  <Label htmlFor="ticket-action-message">{tx(copy.label)}</Label>
                  <Textarea
                     id="ticket-action-message"
                     value={message}
                     rows={4}
                     maxLength={10000}
                     onChange={(event) => setMessage(event.target.value)}
                  />
               </div>
            )}
            {error && (
               <p role="alert" className="text-sm text-destructive">
                  {error}
               </p>
            )}
            <DialogFooter>
               <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                  {tx('Close')}
               </Button>
               <Button
                  type="button"
                  disabled={busy || (copy.required && !message.trim())}
                  onClick={() => void confirm()}
               >
                  {tx(copy.confirm)}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}
