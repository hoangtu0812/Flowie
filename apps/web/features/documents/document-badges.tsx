'use client';

import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';
import type { DocStatus, DocType } from '@/lib/document-tree';
import { cn } from '@/lib/utils';

export const DOC_TYPES: DocType[] = ['FDS', 'TDS', 'ADR', 'RCA', 'GUIDE', 'OTHER'];
export const DOC_STATUSES: { value: DocStatus; label: keyof typeof messages }[] = [
   { value: 'DRAFT', label: 'Draft' },
   { value: 'IN_REVIEW', label: 'In review' },
   { value: 'APPROVED', label: 'Approved' },
];

const TYPE_TONES: Partial<Record<DocType, string>> = {
   FDS: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
   TDS: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
   ADR: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
   RCA: 'bg-red-500/15 text-red-700 dark:text-red-300',
};
const STATUS_TONES: Record<DocStatus, string> = {
   DRAFT: 'text-muted-foreground',
   IN_REVIEW: 'text-amber-700 dark:text-amber-300',
   APPROVED: 'text-emerald-700 dark:text-emerald-300',
};

/** Small type tag; OTHER is not shown. VI: Nhãn loại tài liệu nhỏ; OTHER không hiện. */
export function DocTypeBadge({ type }: { type?: DocType }) {
   if (!type || type === 'OTHER') return null;
   return (
      <span
         className={cn(
            'shrink-0 rounded px-1.5 py-px text-[10px] font-semibold',
            TYPE_TONES[type] ?? 'bg-muted text-muted-foreground'
         )}
      >
         {type}
      </span>
   );
}

/** Review status as coloured text. VI: Trạng thái duyệt dạng chữ có màu. */
export function DocStatusBadge({ status }: { status?: DocStatus }) {
   const tx = useMessages(messages);
   const entry = DOC_STATUSES.find((item) => item.value === status);
   if (!entry) return null;
   return (
      <span className={cn('shrink-0 text-xs', STATUS_TONES[entry.value])}>{tx(entry.label)}</span>
   );
}
