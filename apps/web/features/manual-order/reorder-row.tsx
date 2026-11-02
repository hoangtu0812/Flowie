'use client';

import { useState, type ReactNode } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/Layout';
import { GripVertical, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData, ApiRequestError } from '@/lib/http';
import { useMessages } from '@/features/shared/use-messages';

import type { OrderedItem } from './order';
const messages = {
   'Reorder {name}': 'Đổi thứ tự {name}',
   'Move up {name}': 'Đưa {name} lên',
   'Move down {name}': 'Đưa {name} xuống',
   'Manual': 'Thủ công',
   'The order changed. Reload the list.': 'Thứ tự đã thay đổi. Hãy tải lại danh sách.',
   'Could not reorder.': 'Không đổi được thứ tự.',
} as const;
let dragged: { item: OrderedItem; scope: string } | undefined;

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
   const [busy, setBusy] = useState(false);
   const [edge, setEdge] = useState<'before' | 'after'>();
   const siblings = items.filter(
      (candidate) => (candidate.parentIssueId ?? null) === (item.parentIssueId ?? null)
   );
   const index = siblings.findIndex((candidate) => candidate.id === item.id);
   const move = async (source: OrderedItem, target: OrderedItem, placement: 'before' | 'after') => {
      if (!workspaceId || busy || source.id === target.id) return;
      setBusy(true);
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
                     sourceId: source.id,
                     targetId: target.id,
                     placement,
                     expectedOrder: source.manualOrder ?? '0',
                     expectedTargetOrder: target.manualOrder ?? '0',
                  }),
               }
            )
         );
         await refresh();
      } catch (error) {
         toast.error(
            error instanceof ApiRequestError && error.status === 409
               ? tx('The order changed. Reload the list.')
               : error instanceof Error
                 ? error.message
                 : tx('Could not reorder.')
         );
         await refresh();
      } finally {
         setBusy(false);
      }
   };
   if (!enabled || !workspaceId) return <>{children}</>;
   const accepts = () =>
      dragged &&
      dragged.scope === scope &&
      dragged.item.id !== item.id &&
      (dragged.item.parentIssueId ?? null) === (item.parentIssueId ?? null);
   return (
      <HStack
         gap={0}
         align="stretch"
         width="100%"
         className={
            edge === 'before'
               ? 'border-t-2 border-accent'
               : edge === 'after'
                 ? 'border-b-2 border-accent'
                 : ''
         }
         data-order-id={item.id}
         onDragOver={(event) => {
            if (accepts() && !busy) {
               event.preventDefault();
               setEdge(
                  event.clientY <
                     event.currentTarget.getBoundingClientRect().top +
                        event.currentTarget.getBoundingClientRect().height / 2
                     ? 'before'
                     : 'after'
               );
            }
         }}
         onDragLeave={(event) => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))
               setEdge(undefined);
         }}
         onDrop={(event) => {
            if (!accepts() || busy) return;
            event.preventDefault();
            event.stopPropagation();
            const source = dragged!.item;
            dragged = undefined;
            const placement =
               event.clientY <
               event.currentTarget.getBoundingClientRect().top +
                  event.currentTarget.getBoundingClientRect().height / 2
                  ? 'before'
                  : 'after';
            setEdge(undefined);
            void move(source, item, placement);
         }}
      >
         <DesignSurface>
            <HStack gap={0} height="100%">
               <button
                  type="button"
                  draggable={!busy}
                  disabled={busy}
                  aria-label={tx('Reorder {name}', { name })}
                  title={tx('Reorder {name}', { name })}
                  className="cursor-grab text-secondary"
                  onDragStart={(event) => {
                     dragged = { item, scope };
                     event.dataTransfer.effectAllowed = 'move';
                     event.dataTransfer.setData('application/x-flowie-order', item.id);
                  }}
                  onDragEnd={() => {
                     dragged = undefined;
                     setEdge(undefined);
                  }}
               >
                  <GripVertical className="size-4" />
               </button>
               <Button
                  label={tx('Move up {name}', { name })}
                  isIconOnly
                  icon={<ArrowUp />}
                  variant="ghost"
                  size="sm"
                  isDisabled={busy || index <= 0}
                  onClick={() => void move(item, siblings[index - 1], 'before')}
               />
               <Button
                  label={tx('Move down {name}', { name })}
                  isIconOnly
                  icon={<ArrowDown />}
                  variant="ghost"
                  size="sm"
                  isDisabled={busy || index < 0 || index >= siblings.length - 1}
                  onClick={() => void move(item, siblings[index + 1], 'after')}
               />
            </HStack>
         </DesignSurface>
         <HStack className="flex-1 min-w-0" align="stretch">
            {children}
         </HStack>
      </HStack>
   );
}
