'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { barGeometry, dayWidthOf } from '@/components/common/timeline/timeline-scale';
import { TimelineFrame } from '@/components/common/timeline/timeline-frame';
import { rescheduleIssue, useCanEditIssues } from '@/components/common/timeline/reschedule';
import {
   byManualOrder,
   sortSubIssues,
   type SubIssueSort,
} from '@/features/manual-order/sub-issue-sort';
import { cn } from '@/lib/utils';
import { issueSpan } from '@/lib/issue-span';
import { issueTree } from '@/lib/issue-tree';
import { TimelineIssueBar } from '@/components/common/timeline/timeline-issue-bar';
import { IssuePeekPanel } from '@/features/issues/issue-peek-panel';
import type { ProjectDetailUiIssue } from './project-detail-ui-adapter';
import { format, parseISO } from 'date-fns';
import { ChevronRight } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';

function rangeLabel(issue: ProjectDetailUiIssue): string {
   const { start, end } = issueSpan(issue);
   const startLabel = format(parseISO(start), 'MMM d');
   return end && end !== start ? `${startLabel} – ${format(parseISO(end), 'MMM d')}` : startLabel;
}

/**
 * Children of one issue in the order its tree uses everywhere: saved manual order first (the
 * project payload is ordered by last update), then the branch root's saved sort rule. Status
 * sorting follows the team workflow (`position`, then name, like the options API), keyed by the
 * stored status because the presentation status is mapped by name.
 * VI: Con của một issue theo đúng thứ tự cây của nó ở mọi nơi: trước hết là thứ tự thủ công đã lưu
 * VI: (payload project được sắp theo lần cập nhật cuối), sau đó là quy tắc sort đã lưu của issue
 * VI: gốc nhánh. Sort theo trạng thái đi theo workflow của team (`position`, rồi tên, như API
 * VI: options), dùng trạng thái đã lưu vì trạng thái hiển thị được map theo tên.
 */
function orderedChildren(
   children: ProjectDetailUiIssue[],
   sort: SubIssueSort,
   statuses: { id: string }[]
): ProjectDetailUiIssue[] {
   const rows = byManualOrder(children).map((issue) => ({
      issue,
      id: issue.id,
      identifier: issue.identifier,
      status: { id: issue.workflowStatus?.id ?? issue.status.id },
   }));
   return sortSubIssues(rows, sort, statuses).map((row) => row.issue);
}

/**
 * Project "Timeline" tab: the project's issues on the same month scale the Projects timeline uses,
 * grouped by status, with sub-issues nested under their parent in the order the parent's
 * Sub-issues section shows (read only here: the order is changed in the parent issue). Members who
 * may edit drag a bar to move it or its edges to change the start or end; the save sends the
 * version this screen read and the project reloads afterwards, also after a conflict.
 * VI: Tab "Timeline" của project: issue của project trên cùng thang tháng với timeline Projects,
 * VI: nhóm theo trạng thái, sub-issue lồng dưới cha theo đúng thứ tự khu Sub-issues của cha (ở đây
 * VI: chỉ xem: đổi thứ tự trong issue cha). Thành viên có quyền sửa kéo thanh để dời hoặc kéo mép
 * VI: để đổi ngày bắt đầu/kết thúc; lần lưu gửi version màn hình đã đọc và project được tải lại
 * VI: sau đó, kể cả khi xung đột.
 */
export function ProjectIssuesTimeline({
   issues,
   onIssueChanged,
}: {
   issues: ProjectDetailUiIssue[];
   /** Reloads the project after a save in the peek panel or a drag so bars move at once.
    * VI: Tải lại dự án sau khi lưu trong panel hoặc kéo thả để thanh timeline đổi ngay. */
   onIssueChanged?: () => void;
}) {
   const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
   const [peekIssueId, setPeekIssueId] = useState<string | null>(null);
   const canEdit = useCanEditIssues();

   const tree = useMemo(() => issueTree(issues), [issues]);
   const childrenByParent = tree.children;
   const statuses = useMemo(
      () =>
         [
            ...new Map(
               issues.flatMap((issue) =>
                  issue.workflowStatus
                     ? [[issue.workflowStatus.id, issue.workflowStatus] as const]
                     : []
               )
            ).values(),
         ].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
      [issues]
   );

   const groups = useMemo(() => {
      const byStatus = new Map<
         string,
         { name: string; color: string; issues: ProjectDetailUiIssue[] }
      >();
      for (const issue of tree.roots) {
         const group = byStatus.get(issue.status.id) ?? {
            name: issue.status.name,
            color: issue.status.color,
            issues: [],
         };
         group.issues.push(issue);
         byStatus.set(issue.status.id, group);
      }
      for (const group of byStatus.values()) {
         group.issues.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      return [...byStatus.values()];
   }, [tree]);

   if (issues.length === 0) {
      return (
         <div className="h-full grid place-items-center text-sm text-muted-foreground">
            No issues to place on the timeline yet.
         </div>
      );
   }

   // Renders an issue row and, when opened, its sub-issues one level deeper; each level opens
   // and closes on its own and indents by depth, so A → B → C trees show every level. `sort` is
   // the branch root's saved rule, applied to every level like the root's Sub-issues section.
   // VI: Render hàng issue và, khi mở, các sub-issue ở cấp sâu hơn; mỗi cấp mở/đóng độc lập và
   // VI: thụt lề theo độ sâu, nên cây A → B → C hiển thị đủ mọi cấp. `sort` là quy tắc đã lưu của
   // VI: issue gốc nhánh, áp dụng cho mọi cấp giống khu Sub-issues của issue gốc.
   const renderBranch = (
      item: ProjectDetailUiIssue,
      depth: number,
      sort: SubIssueSort,
      monthWidth: number
   ): ReactNode => {
      const children = orderedChildren(childrenByParent.get(item.id) ?? [], sort, statuses);
      const expanded = expandedParents.has(item.id);
      const { start, end } = issueSpan(item);
      const { left, width } = barGeometry(start, end, monthWidth);
      return (
         <div key={item.id}>
            <div className="relative h-8 flex items-center">
               <TimelineIssueBar
                  left={left}
                  width={width}
                  color={item.status.color}
                  dashed={!end}
                  title={item.title}
                  label={`${item.identifier} · ${item.title} — ${rangeLabel(item)}`}
                  onClick={() =>
                     setPeekIssueId((current) => (current === item.id ? null : item.id))
                  }
                  schedule={
                     canEdit
                        ? {
                             start,
                             end,
                             monthWidth,
                             dayWidth: dayWidthOf(monthWidth),
                             onChange: async (nextStart, nextEnd) => {
                                const result = await rescheduleIssue(item, nextStart, nextEnd);
                                if (result !== 'failed') onIssueChanged?.();
                                return result === 'saved';
                             },
                          }
                        : undefined
                  }
               />
               <div
                  className="sticky left-0 z-10 flex items-center gap-1.5 w-56 shrink-0 pr-4 h-8 bg-container/95 backdrop-blur-sm text-[11px] border-r border-border/40"
                  style={{ paddingLeft: 16 + depth * 20 }}
               >
                  {children.length > 0 ? (
                     <button
                        type="button"
                        aria-label={
                           expanded
                              ? `Hide sub-issues of ${item.title}`
                              : `Show sub-issues of ${item.title}`
                        }
                        aria-expanded={expanded}
                        onClick={() =>
                           setExpandedParents((current) => {
                              const next = new Set(current);
                              if (next.has(item.id)) next.delete(item.id);
                              else next.add(item.id);
                              return next;
                           })
                        }
                        className="text-muted-foreground hover:text-foreground"
                     >
                        <ChevronRight
                           className={cn('size-3.5 transition-transform', expanded && 'rotate-90')}
                        />
                     </button>
                  ) : (
                     <span className="size-3.5 shrink-0" aria-hidden="true" />
                  )}
                  <item.priority.icon className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-muted-foreground shrink-0">{item.identifier}</span>
                  <span className="truncate flex-1 text-muted-foreground">{item.title}</span>
                  {item.assignee && (
                     <Avatar className="size-4 shrink-0">
                        <AvatarImage src={item.assignee.avatarUrl} alt={item.assignee.name} />
                        <AvatarFallback>{item.assignee.name[0]}</AvatarFallback>
                     </Avatar>
                  )}
               </div>
            </div>
            {expanded && children.map((child) => renderBranch(child, depth + 1, sort, monthWidth))}
         </div>
      );
   };

   return (
      <>
         {peekIssueId !== null && (
            <IssuePeekPanel
               issueId={peekIssueId}
               onClose={() => setPeekIssueId(null)}
               onChanged={onIssueChanged}
            />
         )}
         <TimelineFrame className="h-full">
            {(monthWidth) =>
               groups.map((group) => (
                  <div key={group.name}>
                     <div className="sticky left-0 flex items-center gap-2 px-4 h-8 text-xs font-medium bg-container border-y border-border/50 w-screen max-w-full">
                        <span
                           className="size-2 rounded-full shrink-0"
                           style={{ backgroundColor: group.color }}
                        />
                        {group.name}
                        <span className="text-xs text-muted-foreground">{group.issues.length}</span>
                     </div>
                     <div className="py-1">
                        {group.issues.map((issue) =>
                           renderBranch(issue, 0, issue.subIssueSort ?? 'manual', monthWidth)
                        )}
                     </div>
                  </div>
               ))
            }
         </TimelineFrame>
      </>
   );
}
