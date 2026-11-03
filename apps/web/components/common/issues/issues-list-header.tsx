'use client';

import { HStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import type { ColumnSortKey } from '@/features/issues/column-sorting';
import { ISSUE_COLUMN } from './issue-columns';

function SortLabel({ column, label }: { column: ColumnSortKey; label: string }) {
   const sorts = useDisplaySettingsStore((state) => state.columnSorts) ?? [];
   const toggle = useDisplaySettingsStore((state) => state.toggleColumnSort);
   const index = sorts.findIndex((sort) => sort.key === column);
   const sort = sorts[index];
   const tx = useMessages(messages);
   const hint = tx('Click to sort; Shift+click for multiple columns.');
   return (
      <button
         type="button"
         className="inline-flex items-center gap-1 min-w-0 hover:text-foreground"
         aria-label={`${label}: ${tx(sort?.direction === 'asc' ? 'ascending' : sort ? 'descending' : 'default order')}${index >= 0 ? ` (${index + 1})` : ''}`}
         title={hint}
         onClick={(event) => toggle(column, event.shiftKey)}
      >
         <Text type="inherit">{label}</Text>
         {sort ? (
            sort.direction === 'asc' ? (
               <ArrowUp className="size-3 shrink-0" />
            ) : (
               <ArrowDown className="size-3 shrink-0" />
            )
         ) : (
            <ArrowUpDown className="size-3 shrink-0" />
         )}
         {sorts.length > 1 && index >= 0 && <Text type="inherit">{index + 1}</Text>}
      </button>
   );
}

export function IssuesListHeader() {
   const tx = useMessages(messages);
   const { displayProperties } = useDisplaySettingsStore();
   const columns = [
      ['labels', 'Labels'],
      ['project', 'Project'],
      ['startDate', 'Start'],
      ['targetDate', 'End'],
      ['estimatedEffort', 'Est. effort'],
      ['actualEffort', 'Act. effort'],
      ['cycle', 'Cycle'],
      ['created', 'Created'],
      ['dueDate', 'Due date'],
      ['assignee', 'Assignee'],
   ] as const;
   return (
      <HStack
         gap={0}
         paddingInline={6}
         height={32}
         className="bg-container text-xs text-muted-foreground border-b sticky top-0 z-20"
      >
         <HStack className="flex-1 min-w-0">
            <SortLabel column="title" label={tx('Title')} />
         </HStack>
         {columns.map(
            ([key, label]) =>
               displayProperties[key] && (
                  <HStack key={key} className={ISSUE_COLUMN[key]}>
                     <SortLabel column={key} label={tx(label)} />
                  </HStack>
               )
         )}
      </HStack>
   );
}
