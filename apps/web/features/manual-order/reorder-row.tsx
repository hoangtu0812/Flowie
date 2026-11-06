'use client';

import { createContext, useContext, useRef, useState, type ReactNode } from 'react';
import { pointerIntersection, type CollisionDetector } from '@dnd-kit/collision';
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

// Sibling rows differ in height: a sub-issue with expanded children is several rows tall. After
// a swap that taller row can still lie under the pointer, so the default detector reports it
// again and swaps back, and a short row can never cross it. A sibling therefore counts only once
// the pointer has passed its middle, moving away from the dragged row: after the swap the pointer
// is on the near side of that middle, so the same sibling cannot trigger a second swap. Keyboard
// moves use the sortable plugin's own detector and are not affected.
// VI: Các hàng cùng cấp có chiều cao khác nhau: sub-issue đang mở con cao bằng nhiều hàng. Sau khi
// VI: đổi chỗ, hàng cao hơn có thể vẫn nằm dưới con trỏ nên detector mặc định báo lại và đổi ngược,
// VI: khiến hàng ngắn không bao giờ vượt qua được. Vì vậy hàng cùng cấp chỉ được tính khi con trỏ
// VI: đã qua điểm giữa của nó theo hướng rời khỏi hàng đang kéo: sau khi đổi, con trỏ nằm phía gần
// VI: của điểm giữa nên hàng đó không gây đổi lần hai. Di chuyển bằng bàn phím dùng detector riêng
// VI: của plugin sortable nên không bị ảnh hưởng.
const pastSiblingMiddle: CollisionDetector = (input) => {
   const { droppable, dragOperation } = input;
   const { source, position } = dragOperation;
   if (!source || !droppable.shape) return null;
   // Only sortable rows use this detector, so both entities carry their current index.
   // VI: Chỉ hàng sortable dùng detector này nên cả hai đều có index hiện tại.
   const from = (source as unknown as { index: number }).index;
   const to = (droppable as unknown as { index: number }).index;
   if (from === to) return null;
   const { y } = position.current;
   const middle = droppable.shape.center.y;
   const passed = from < to ? y > middle : y < middle;
   return passed ? pointerIntersection(input) : null;
};

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
   optimistic,
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
   optimistic: (sourceId: string, targetId: string, placement: 'before' | 'after') => void;
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
      const placement = nextIndex < index ? 'before' : 'after';
      optimistic(item.id, target.id, placement);
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
                     placement,
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
      collisionDetector: pastSiblingMiddle,
      disabled: !enabled || !workspaceId || busy,
      data: { commit },
   });
   // Keep the handle mounted when hidden: removing its ref makes accessibility fall back to the
   // entire row, which contains other buttons and links and must never become a nested button.
   // VI: Giữ handle trong DOM khi ẩn: gỡ ref làm trợ năng chuyển sang cả hàng, vốn chứa nút và link
   // VI: khác nên không được biến thành nút lồng nhau.
   return (
      <HStack
         ref={ref}
         gap={0}
         align="stretch"
         width="100%"
         data-order-id={enabled && workspaceId ? item.id : undefined}
         data-dragging={isDragging || undefined}
      >
         <DesignSurface>
            <button
               ref={handleRef}
               type="button"
               hidden={!enabled || !workspaceId}
               disabled={busy || !enabled || !workspaceId}
               aria-label={tx('Reorder {name}', { name })}
               title={tx('Reorder {name}', { name })}
               className="cursor-grab touch-none text-secondary self-start"
            >
               <Icon icon={GripVertical} size="sm" />
            </button>
         </DesignSurface>
         <VStack gap={0} className="flex-1 min-w-0" align="stretch">
            {children}
         </VStack>
      </HStack>
   );
}
