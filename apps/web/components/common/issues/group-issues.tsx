'use client';

import { Issue } from '@/mock-data/issues';
import { Status } from '@/mock-data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useViewStore } from '@/store/view-store';
import { useCreateIssueStore } from '@/store/create-issue-store';
import { cn } from '@/lib/utils';
import { ChevronDown, Plus } from 'lucide-react';
import { FC, ReactNode, useRef, useState } from 'react';
import { useDrop } from 'react-dnd';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '../../ui/button';
import { IssueDragType, IssueGrid } from './issue-grid';
import { IssueLine } from './issue-line';

/**
 * Generic descriptor of an issue group. Groups are usually statuses but the
 * "Display" settings also allow grouping by assignee / priority / project.
 */
export interface IssueGroupDescriptor {
   id: string;
   name: string;
   color: string;
   icon: ReactNode;
   /** Set when grouping by status: enables board drop + "+" default status. */
   status?: Status;
}

interface GroupIssuesProps {
   group: IssueGroupDescriptor;
   /** Issues of the group, already sorted upstream. */
   issues: Issue[];
   count: number;
}

export function GroupIssues({ group, issues, count }: GroupIssuesProps) {
   const { viewType } = useViewStore();
   const isViewTypeGrid = viewType === 'grid';
   const { openModal } = useCreateIssueStore();
   // List groups collapse from their header row; the state is per mounted group
   // (keyed by group id upstream), starts expanded and is not persisted.
   // VI: Nhóm ở chế độ List thu gọn từ dòng tiêu đề; state gắn với từng nhóm đang
   // hiển thị (key theo id nhóm ở component cha), mặc định mở và không được lưu lại.
   const [collapsed, setCollapsed] = useState(false);
   const groupLabel = (
      <>
         {group.icon}
         <span className="text-sm font-medium">{group.name}</span>
         <span className="text-sm text-muted-foreground">{count}</span>
      </>
   );

   return (
      <div
         className={cn(
            'bg-conainer',
            isViewTypeGrid
               ? 'overflow-hidden rounded-md h-full flex-shrink-0 w-[348px] flex flex-col'
               : ''
         )}
      >
         <div
            className={cn(
               'sticky z-10 bg-container w-full',
               // The list has a column header of its own to stay clear of.
               isViewTypeGrid ? 'top-0 rounded-t-md h-[50px]' : 'top-8 h-10'
            )}
         >
            <div
               className={cn(
                  'w-full h-full flex items-center justify-between',
                  isViewTypeGrid ? 'px-3' : 'px-6'
               )}
               style={{
                  backgroundColor: isViewTypeGrid ? `${group.color}10` : `${group.color}08`,
               }}
            >
               {isViewTypeGrid ? (
                  <div className="flex items-center gap-2">{groupLabel}</div>
               ) : (
                  // The whole row except "+" is the toggle, so it is easy to hit; "+" stays
                  // a sibling because a button cannot contain another button.
                  // VI: Cả dòng (trừ nút "+") là nút thu gọn để dễ bấm; "+" là phần tử anh em
                  // vì button không được lồng button khác.
                  <button
                     type="button"
                     aria-expanded={!collapsed}
                     aria-label={`${group.name}, ${count} ${count === 1 ? 'issue' : 'issues'}`}
                     onClick={() => setCollapsed((value) => !value)}
                     className="flex flex-1 h-full items-center gap-2 -ml-5 text-left"
                  >
                     <ChevronDown
                        className={cn(
                           'size-3.5 text-muted-foreground transition-transform',
                           collapsed && '-rotate-90'
                        )}
                     />
                     {groupLabel}
                  </button>
               )}

               <Button
                  aria-label={`Create issue in ${group.name}`}
                  className="size-6"
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                     e.stopPropagation();
                     openModal(group.status);
                  }}
               >
                  <Plus className="size-4" />
               </Button>
            </div>
         </div>

         {viewType === 'list' ? (
            !collapsed && (
               <div className="space-y-0">
                  {issues.map((issue) => (
                     <IssueLine key={issue.id} issue={issue} layoutId={true} />
                  ))}
               </div>
            )
         ) : (
            <IssueGridList issues={issues} status={group.status} />
         )}
      </div>
   );
}

const IssueGridList: FC<{ issues: Issue[]; status?: Status }> = ({ issues, status }) => {
   const ref = useRef<HTMLDivElement>(null);
   const { updateIssueStatus } = useIssuesStore();

   // Set up drop functionality to accept only issue items.
   const [{ isOver }, drop] = useDrop(() => ({
      accept: IssueDragType,
      canDrop: () => status !== undefined,
      drop(item: Issue, monitor) {
         if (status && monitor.didDrop() && item.status.id !== status.id) {
            updateIssueStatus(item.id, status);
         }
      },
      collect: (monitor) => ({
         isOver: !!monitor.isOver() && !!monitor.canDrop(),
      }),
   }));
   drop(ref);

   return (
      <div
         ref={ref}
         className="flex-1 h-full overflow-y-auto p-2 space-y-2 bg-zinc-50/50 dark:bg-zinc-900/50 relative"
      >
         <AnimatePresence>
            {isOver && (
               <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.1 }}
                  className="fixed top-0 left-0 right-0 bottom-0 z-10 flex items-center justify-center pointer-events-none bg-background/90"
                  style={{
                     width: ref.current?.getBoundingClientRect().width || '100%',
                     height: ref.current?.getBoundingClientRect().height || '100%',
                     transform: `translate(${ref.current?.getBoundingClientRect().left || 0}px, ${ref.current?.getBoundingClientRect().top || 0}px)`,
                  }}
               >
                  <div className="bg-background border border-border rounded-md p-3 shadow-md max-w-[90%]">
                     <p className="text-sm font-medium text-center">Drop to update status</p>
                  </div>
               </motion.div>
            )}
         </AnimatePresence>
         {issues.map((issue) => (
            <IssueGrid key={issue.id} issue={issue} />
         ))}
      </div>
   );
};
