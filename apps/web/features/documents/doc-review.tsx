'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, CircleDashed, MessageSquareWarning, UserPlus, X } from 'lucide-react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button as ActionButton } from '@astryxdesign/core/Button';
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
   const key = `${document.id}:${document.version}:${document.status}`;
   const activeKey = useRef(key);
   activeKey.current = key;
   const request = useRef(0);
   const [attempt, setAttempt] = useState(0);
   const [snapshot, setSnapshot] = useState<{
      key: string;
      review?: DocumentReview;
      failed?: boolean;
   }>();
   useEffect(() => {
      const generation = ++request.current;
      let active = true;
      setSnapshot(undefined);
      void loadDocumentReview(document.id)
         .then((review) => {
            if (active && generation === request.current) setSnapshot({ key, review });
         })
         .catch(() => {
            if (active && generation === request.current) setSnapshot({ key, failed: true });
         });
      return () => {
         active = false;
      };
   }, [document.id, key, attempt]);
   const run = useCallback(
      async (action: () => Promise<DocumentReview>) => {
         // New actions invalidate older reads; only the newest response may replace permissions.
         // VI: Thao tác mới vô hiệu lượt đọc cũ; chỉ phản hồi mới nhất được thay quyền hiện tại.
         const generation = ++request.current;
         try {
            const review = await action();
            if (activeKey.current !== key) return false;
            if (generation === request.current) setSnapshot({ key, review });
            onChanged?.();
            return true;
         } catch (caught) {
            if (activeKey.current === key) toast.error(failure(caught, tx('Could not save.')));
            return false;
         }
      },
      [key, onChanged, tx]
   );
   const current = snapshot?.key === key ? snapshot : undefined;
   return {
      review: current?.review,
      failed: !!current?.failed,
      loading: !current,
      retry: () => setAttempt((n) => n + 1),
      run,
   };
}

/**
 * Review block under the linked tasks: who approves, each reviewer's decision with its note,
 * the eligible approver's reviewer picker and the assigned reviewer's Approve / Request changes. Hidden for a
 * document that is neither in review nor has reviewers. Permissions come from the server, which
 * enforces the same rules.
 * VI: Khối duyệt dưới task liên kết: ai duyệt cuối, quyết định của từng reviewer kèm nhận xét,
 * VI: hộp chọn reviewer của người duyệt hợp lệ và nút Đồng ý / Yêu cầu sửa của reviewer được giao. Ẩn với tài
 * VI: liệu không Đang duyệt và chưa có reviewer. Quyền lấy từ server, nơi áp dụng cùng quy tắc.
 */
export function DocumentReviewPanel({
   documentId,
   review,
   run,
   loading = false,
   failed = false,
   onRetry,
}: {
   loading?: boolean;
   failed?: boolean;
   onRetry?: () => void;
   documentId: string;
   review: DocumentReview | undefined;
   run: (action: () => Promise<DocumentReview>) => Promise<boolean>;
}) {
   const tx = useMessages(messages);
   if (loading || failed)
      return (
         <VStack
            as="section"
            gap={2}
            aria-label={tx('Review')}
            className="rounded border border-border p-3"
         >
            <Text role={failed ? 'alert' : 'status'}>
               {tx(
                  failed ? 'Could not load approval permissions.' : 'Loading approval permissions…'
               )}
            </Text>
            {failed && <ActionButton size="sm" label={tx('Retry')} onClick={onRetry} />}
         </VStack>
      );
   if (!review || (review.status !== 'IN_REVIEW' && review.reviewers.length === 0)) return null;
   const reason = review.approveBlockedReason;
   const pending = /^(\d+) reviewer\(s\) have not approved this version yet\.$/.exec(reason ?? '');
   const ownDocument =
      reason === 'You wrote this document: another reviewer must approve it first.';
   const explanation = ownDocument
      ? tx('You wrote this document: another reviewer must approve it first.')
      : pending
        ? tx('{count} reviewer(s) have not approved this version yet.', { count: pending[1] })
        : reason;
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
            {review.reviewers.length === 0 && <span>{tx('No reviewers assigned.')}</span>}
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
         {review.status === 'IN_REVIEW' && explanation && (
            <VStack gap={1} className="rounded bg-muted p-3 text-foreground" role="status">
               <Text type="label">{tx('Approval is not ready')}</Text>
               <Text>{explanation}</Text>
               <Text type="supporting">
                  {tx(
                     ownDocument
                        ? 'Assign another team member as a reviewer and wait for their agreement. Documents created through MCP use the connection owner as their author.'
                        : 'Check the reviewers above and wait for every assigned reviewer to agree.'
                  )}
               </Text>
            </VStack>
         )}
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
