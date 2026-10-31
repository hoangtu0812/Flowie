'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, CircleDashed, MessageSquareWarning, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Textarea } from '@/components/ui/textarea';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';
import {
   decideDocumentReview,
   loadDocumentReview,
   setDocumentReviewers,
   type DocumentReview,
   type ProjectTreeDocument,
} from './project-docs-api';

const failure = (caught: unknown, fallback: string) =>
   caught instanceof Error && caught.message ? caught.message : fallback;

/**
 * Review state of the shown document, reloaded when the document, its version or its status
 * changes, since edits clear decisions and a change request returns the document to Draft.
 * `run` applies a review action and reports the document change to the parent.
 * VI: Trạng thái duyệt của tài liệu đang xem, tải lại khi đổi tài liệu, phiên bản hoặc trạng thái,
 * VI: vì sửa sẽ xoá quyết định và yêu cầu sửa đưa tài liệu về Nháp. `run` thực hiện một thao tác
 * VI: duyệt và báo cho component cha rằng tài liệu đã đổi.
 */
export function useDocumentReview(document: ProjectTreeDocument, onChanged?: () => void) {
   const tx = useMessages(messages);
   const [review, setReview] = useState<DocumentReview>();
   useEffect(() => {
      let active = true;
      void loadDocumentReview(document.id)
         .then((state) => active && setReview(state))
         .catch(() => active && setReview(undefined));
      return () => {
         active = false;
      };
   }, [document.id, document.version, document.status]);
   const run = useCallback(
      async (action: () => Promise<DocumentReview>) => {
         try {
            setReview(await action());
            onChanged?.();
            return true;
         } catch (caught) {
            toast.error(failure(caught, tx('Could not save.')));
            return false;
         }
      },
      [onChanged, tx]
   );
   return { review, run };
}

/**
 * Review block under the linked tasks: who approves, each reviewer's decision with its note,
 * the lead's reviewer picker and the assigned reviewer's Approve / Request changes. Hidden for a
 * document that is neither in review nor has reviewers. Permissions come from the server, which
 * enforces the same rules.
 * VI: Khối duyệt dưới task liên kết: ai duyệt cuối, quyết định của từng reviewer kèm nhận xét,
 * VI: hộp chọn reviewer của lead và nút Đồng ý / Yêu cầu sửa của reviewer được giao. Ẩn với tài
 * VI: liệu không Đang duyệt và chưa có reviewer. Quyền lấy từ server, nơi áp dụng cùng quy tắc.
 */
export function DocumentReviewPanel({
   documentId,
   review,
   run,
}: {
   documentId: string;
   review: DocumentReview | undefined;
   run: (action: () => Promise<DocumentReview>) => Promise<boolean>;
}) {
   const tx = useMessages(messages);
   if (!review || (review.status !== 'IN_REVIEW' && review.reviewers.length === 0)) return null;
   return (
      <section
         aria-label={tx('Review')}
         className="space-y-2 rounded-md border px-3 py-2 text-xs text-muted-foreground"
      >
         <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{tx('Approver')}:</span>
            <span className="text-foreground">
               {review.approvers.map((person) => person.name).join(', ') || '—'}
            </span>
            {review.canAssign && (
               <ReviewerPicker
                  review={review}
                  onSave={(ids) => run(() => setDocumentReviewers(documentId, ids))}
               />
            )}
         </div>
         <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{tx('Reviewers')}:</span>
            {review.reviewers.length === 0 && <span>{tx('The lead reviews it.')}</span>}
            {review.reviewers.map((reviewer) => (
               <span
                  key={reviewer.id}
                  className="inline-flex items-center gap-1 text-foreground"
                  title={reviewer.note ?? undefined}
               >
                  {reviewer.decision === 'APPROVED' ? (
                     <Check className="size-3.5 text-emerald-600" aria-label={tx('Agreed')} />
                  ) : reviewer.decision === 'CHANGES_REQUESTED' ? (
                     <X
                        className="size-3.5 text-destructive"
                        aria-label={tx('Changes requested')}
                     />
                  ) : (
                     <CircleDashed
                        className="size-3.5 text-muted-foreground"
                        aria-label={tx('Waiting')}
                     />
                  )}
                  {reviewer.name}
               </span>
            ))}
         </div>
         {review.reviewers
            .filter((reviewer) => reviewer.decision === 'CHANGES_REQUESTED' && reviewer.note)
            .map((reviewer) => (
               <p key={reviewer.id} className="flex gap-1.5 text-foreground">
                  <MessageSquareWarning className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                  <span>
                     <span className="font-medium">{reviewer.name}:</span> {reviewer.note}
                  </span>
               </p>
            ))}
         {review.canDecide && (
            <DecisionButtons
               onDecide={(decision, note) =>
                  run(() => decideDocumentReview(documentId, decision, note))
               }
            />
         )}
      </section>
   );
}

function ReviewerPicker({
   review,
   onSave,
}: {
   review: DocumentReview;
   onSave: (ids: string[]) => Promise<boolean>;
}) {
   const tx = useMessages(messages);
   const [open, setOpen] = useState(false);
   const [chosen, setChosen] = useState<string[]>([]);
   const [saving, setSaving] = useState(false);
   return (
      <Popover
         open={open}
         onOpenChange={(next) => {
            setOpen(next);
            if (next) setChosen(review.reviewers.map((reviewer) => reviewer.id));
         }}
      >
         <PopoverTrigger asChild>
            <Button size="xs" variant="ghost">
               <UserPlus className="size-3.5" />
               {tx('Assign reviewers')}
            </Button>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-64 space-y-2 p-2">
            <div
               className="max-h-60 space-y-1 overflow-y-auto"
               role="group"
               aria-label={tx('Reviewers')}
            >
               {review.members.map((person) => (
                  <label
                     key={person.id}
                     className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent/50"
                  >
                     <Checkbox
                        checked={chosen.includes(person.id)}
                        onCheckedChange={(checked) =>
                           setChosen((ids) =>
                              checked ? [...ids, person.id] : ids.filter((id) => id !== person.id)
                           )
                        }
                     />
                     <span className="truncate">{person.name}</span>
                  </label>
               ))}
            </div>
            <Button
               size="xs"
               className="w-full"
               disabled={saving}
               onClick={async () => {
                  setSaving(true);
                  if (await onSave(chosen)) setOpen(false);
                  setSaving(false);
               }}
            >
               {tx('Save')}
            </Button>
         </PopoverContent>
      </Popover>
   );
}

function DecisionButtons({
   onDecide,
}: {
   onDecide: (decision: 'APPROVED' | 'CHANGES_REQUESTED', note?: string) => Promise<boolean>;
}) {
   const tx = useMessages(messages);
   const [asking, setAsking] = useState(false);
   const [note, setNote] = useState('');
   const [saving, setSaving] = useState(false);
   const send = async (decision: 'APPROVED' | 'CHANGES_REQUESTED') => {
      setSaving(true);
      if (await onDecide(decision, decision === 'CHANGES_REQUESTED' ? note.trim() : undefined)) {
         setAsking(false);
         setNote('');
      }
      setSaving(false);
   };
   if (asking)
      return (
         <div className="space-y-1.5">
            <Textarea
               value={note}
               onChange={(event) => setNote(event.target.value)}
               placeholder={tx('What needs to change?')}
               aria-label={tx('What needs to change?')}
               maxLength={2000}
               autoFocus
            />
            <div className="flex gap-1">
               <Button
                  size="xs"
                  variant="destructive"
                  disabled={saving || !note.trim()}
                  onClick={() => void send('CHANGES_REQUESTED')}
               >
                  {tx('Send change request')}
               </Button>
               <Button size="xs" variant="ghost" onClick={() => setAsking(false)}>
                  {tx('Cancel')}
               </Button>
            </div>
         </div>
      );
   return (
      <div className="flex gap-1">
         <Button
            size="xs"
            variant="secondary"
            disabled={saving}
            onClick={() => void send('APPROVED')}
         >
            <Check className="size-3.5" />
            {tx('Looks good')}
         </Button>
         <Button size="xs" variant="ghost" disabled={saving} onClick={() => setAsking(true)}>
            <X className="size-3.5" />
            {tx('Request changes')}
         </Button>
      </div>
   );
}
