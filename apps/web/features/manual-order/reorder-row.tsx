'use client';

import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { Feedback } from '@dnd-kit/dom';
import { DragDropProvider } from '@dnd-kit/react';
import { isSortable, useSortable } from '@dnd-kit/react/sortable';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Icon } from '@astryxdesign/core/Icon';
import { GripVertical } from 'lucide-react';
import { toast } from 'sonner';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData, ApiRequestError } from '@/lib/http';
import { useMessages } from '@/features/shared/use-messages';
import type { OrderedItem } from './order';

const messages = {
   'Reorder {name}': 'Đổi thứ tự {name}',
   'Manual': 'Thủ công',
   'The order changed. Reload the list.': 'Thứ tự đã thay đổi. Hãy tải lại danh sách.',
   'Could not reorder.': 'Không đổi được thứ tự.',
} as const;
const BusyContext = createContext(false);

type ReorderData = { commit: (index: number) => Promise<void> };

export function ReorderProvider({ children }: { children: ReactNode }) {
   const [busy, setBusy] = useState(false);
   const saving = useRef(false);
   return (
      <BusyContext.Provider value={busy}>
         <DragDropProvider<ReorderData>
            plugins={(defaults) => [...defaults, Feedback.configure({ feedback: 'clone' })]}
            onDragEnd={async (event) => {
               if (event.canceled || saving.current) return;
               const source = event.operation.source;
               if (
                  !isSortable(source) ||
                  source.initialGroup !== source.group ||
                  source.initialIndex === source.index
               )
                  return;
               saving.current = true;
               setBusy(true);
               try {
                  await source.data.commit(source.index);
               } finally {
                  saving.current = false;
                  setBusy(false);
               }
            }}
         >
            {children}
         </DragDropProvider>
      </BusyContext.Provider>
   );
}

export function ManualLabel() {
   const tx = useMessages(messages);
   return <>{tx('Manual')}</>;
}

export function ReorderRow({
   item,
   items,
   name,
   workspaceId,
   entityType,
   scope,
   enabled,
   refresh,
   children,
}: {
   item: OrderedItem;
   items: OrderedItem[];
   name: string;
   workspaceId?: string;
   entityType: 'issue' | 'project';
   scope: string;
   enabled: boolean;
   refresh: () => void | Promise<void>;
   children: ReactNode;
}) {
   const tx = useMessages(messages);
   const busy = useContext(BusyContext);
   const siblings = items.filter(
      (candidate) => (candidate.parentIssueId ?? null) === (item.parentIssueId ?? null)
   );
   const index = siblings.findIndex((candidate) => candidate.id === item.id);
   const group = `${scope}:${item.parentIssueId ?? 'root'}`;
   const commit = async (nextIndex: number) => {
      const target = siblings[nextIndex];
      if (!workspaceId || !target || target.id === item.id) return;
      try {
         await responseData(
            await authenticatedFetch(
               `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/manual-order`,
               {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                     workspaceId,
                     entityType,
                     sourceId: item.id,
                     targetId: target.id,
                     placement: nextIndex < index ? 'before' : 'after',
                     expectedOrder: item.manualOrder ?? '0',
                     expectedTargetOrder: target.manualOrder ?? '0',
                  }),
               }
            )
         );
      } catch (error) {
         toast.error(
            error instanceof ApiRequestError && error.status === 409
               ? tx('The order changed. Reload the list.')
               : error instanceof Error
                 ? error.message
                 : tx('Could not reorder.')
         );
      } finally {
         await refresh();
      }
   };
   // Scope and parent form the sortable type, so pointer and keyboard moves cannot reparent items.
   // VI: Scope và cha tạo kiểu sortable nên di chuyển bằng chuột/bàn phím không thể đổi cha của item.
   const { ref, handleRef, isDragging } = useSortable<ReorderData>({
      id: item.id,
      index,
      group,
      type: group,
      accept: group,
      disabled: !enabled || !workspaceId || busy,
      data: { commit },
   });
   return (
      <HStack
         ref={ref}
         gap={0}
         align="stretch"
         width="100%"
         data-order-id={enabled && workspaceId ? item.id : undefined}
         data-dragging={isDragging || undefined}
      >
         {enabled && workspaceId && (
            <DesignSurface>
               <button
                  ref={handleRef}
                  type="button"
                  disabled={busy}
                  aria-label={tx('Reorder {name}', { name })}
                  title={tx('Reorder {name}', { name })}
                  className="cursor-grab touch-none text-secondary self-start"
               >
                  <Icon icon={GripVertical} size="sm" />
               </button>
            </DesignSurface>
         )}
         <VStack gap={0} className="flex-1 min-w-0" align="stretch">
            {children}
         </VStack>
      </HStack>
   );
}
