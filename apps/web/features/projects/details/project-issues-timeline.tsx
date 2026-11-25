'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { barGeometry, dayWidthOf, offsetFor } from '@/components/common/timeline/timeline-scale';
import {
   dependencyPath,
   isLateDependency,
   issueProgress,
} from '@/components/common/timeline/timeline-gantt';
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
import { Check, ChevronDown, ChevronRight, CircleAlert, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/** Height of every timeline row, so arrows can find a row by its index. VI: Chiều cao mọi hàng. */
const ROW_HEIGHT = 32;

/** Colours of milestone groups, in milestone order. VI: Màu nhóm milestone, theo thứ tự milestone. */
const GROUP_COLORS = ['#a855f7', '#14b8a6', '#3b82f6', '#f59e0b', '#ec4899', '#22c55e', '#f97316'];
const NO_MILESTONE_COLOR = '#94a3b8';

type Milestone = {
   id: string;
   title: string;
   targetDate: string | null;
   completedAt: string | null;
};

type Group = {
   key: string;
   name: string;
   color: string;
   issues: ProjectDetailUiIssue[];
   milestone?: Milestone;
};

type Row =
   | { kind: 'milestones' }
   | { kind: 'group'; group: Group }
   | {
        kind: 'issue';
        issue: ProjectDetailUiIssue;
        depth: number;
        color: string;
        children: ProjectDetailUiIssue[];
     };

const shortDate = (day: string) => format(parseISO(day), 'MMM d');

function rangeLabel(issue: ProjectDetailUiIssue): string {
   const { start, end } = issueSpan(issue);
   const startLabel = shortDate(start);
   return end && end !== start ? `${startLabel} – ${shortDate(end)}` : startLabel;
}

const isDone = (issue: ProjectDetailUiIssue) =>
   issue.status.category === 'completed' || issue.status.category === 'canceled';

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
 * Project "Timeline" tab as a Gantt chart. Issues are grouped by milestone (the project's phases)
 * or by status; each group folds and shows a thin bar over its issues' dates filled by their
 * progress. Bars take the group colour, fill the done part (completed issue, or completed share of
 * its sub-issues) and show the percent. Milestones are diamonds with their title and date, on the
 * group row when grouped by milestone, else on a row of their own. "Blocks" relations between
 * project issues are drawn as arrows, red when the blocker is planned to end after the blocked
 * issue starts. The list names the assignee, the end date and flags issues at risk (overdue or
 * held by a late blocker). Sub-issues nest under their parent in the parent's order.
 *
 * Members who may edit drag a bar to move it or its edges to change the start or end; the save
 * sends the version this screen read and the project reloads afterwards, also after a conflict.
 * Undo puts the last dragged issue back; Reset puts back every issue dragged on this screen.
 * VI: Tab "Timeline" của project dạng Gantt. Issue nhóm theo milestone (các giai đoạn của dự án)
 * VI: hoặc theo trạng thái; mỗi nhóm thu gọn được và có thanh mảnh phủ khoảng ngày của các issue,
 * VI: tô theo tiến độ. Thanh mang màu nhóm, tô đậm phần đã xong (issue đã hoàn thành, hoặc tỉ lệ
 * VI: sub-issue đã xong) và hiện phần trăm. Milestone là hình thoi kèm tên và ngày, nằm trên hàng
 * VI: nhóm khi nhóm theo milestone, ngược lại nằm trên một hàng riêng. Quan hệ "Blocks" giữa các
 * VI: issue của dự án vẽ thành mũi tên, màu đỏ khi issue chặn dự kiến kết thúc sau ngày issue bị
 * VI: chặn bắt đầu. Danh sách hiện người phụ trách, ngày kết thúc và cảnh báo issue có rủi ro (quá
 * VI: hạn hoặc bị chặn bởi issue trễ). Sub-issue lồng dưới cha theo thứ tự của cha.
 * VI:
 * VI: Thành viên có quyền sửa kéo thanh để dời hoặc kéo mép để đổi ngày bắt đầu/kết thúc; lần lưu
 * VI: gửi version màn hình đã đọc và project được tải lại sau đó, kể cả khi xung đột. Undo trả issue
 * VI: vừa kéo về chỗ cũ; Reset trả mọi issue đã kéo trên màn hình này về chỗ cũ.
 */
export function ProjectIssuesTimeline({
   issues,
   milestones = [],
   onIssueChanged,
}: {
   issues: ProjectDetailUiIssue[];
   /** Project milestones: the groups of the "By milestone" view and the diamonds.
    * VI: Milestone của dự án: các nhóm của chế độ "By milestone" và các hình thoi. */
   milestones?: Milestone[];
   /** Reloads the project after a save in the peek panel or a drag so bars move at once.
    * VI: Tải lại dự án sau khi lưu trong panel hoặc kéo thả để thanh timeline đổi ngay. */
   onIssueChanged?: () => void;
}) {
   const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
   const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
   const [groupBy, setGroupBy] = useState<'milestone' | 'status'>(
      milestones.length > 0 ? 'milestone' : 'status'
   );
   const [peekIssueId, setPeekIssueId] = useState<string | null>(null);
   /** Dates before each saved drag, newest last. VI: Ngày trước mỗi lần kéo đã lưu, mới nhất ở cuối. */
   const [history, setHistory] = useState<{ id: string; start: string; end: string | null }[]>([]);
   const [busy, setBusy] = useState(false);
   const [today, setToday] = useState<string | null>(null);
   const canEdit = useCanEditIssues();

   // Read on the client only, so the server render and the first client render agree.
   // VI: Chỉ đọc ở client để lần render server và lần render client đầu tiên khớp nhau.
   useEffect(() => setToday(new Date().toISOString().slice(0, 10)), []);

   const tree = useMemo(() => issueTree(issues), [issues]);
   const byId = useMemo(() => new Map(issues.map((issue) => [issue.id, issue])), [issues]);
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

   const milestoneColors = useMemo(() => {
      const ordered = [...milestones].sort((a, b) =>
         (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999')
      );
      return new Map(
         ordered.map((milestone, index) => [
            milestone.id,
            { milestone, color: GROUP_COLORS[index % GROUP_COLORS.length] },
         ])
      );
   }, [milestones]);

   const groups = useMemo((): Group[] => {
      const byKey = new Map<string, Group>();
      if (groupBy === 'milestone') {
         for (const [id, { milestone, color }] of milestoneColors) {
            byKey.set(id, { key: id, name: milestone.title, color, issues: [], milestone });
         }
      }
      for (const issue of tree.roots) {
         const key =
            groupBy === 'status'
               ? issue.status.id
               : issue.milestoneId && byKey.has(issue.milestoneId)
                 ? issue.milestoneId
                 : 'none';
         const group = byKey.get(key) ?? {
            key,
            name: groupBy === 'status' ? issue.status.name : 'No milestone',
            color: groupBy === 'status' ? issue.status.color : NO_MILESTONE_COLOR,
            issues: [],
         };
         group.issues.push(issue);
         byKey.set(key, group);
      }
      for (const group of byKey.values()) {
         group.issues.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      return [...byKey.values()];
   }, [groupBy, milestoneColors, tree]);

   const progressOf = (issue: ProjectDetailUiIssue) =>
      issueProgress(
         issue.status.category,
         (tree.children.get(issue.id) ?? []).map((child) => child.status.category)
      );

   const lateBlockers = (issue: ProjectDetailUiIssue) =>
      (issue.blockedBy ?? []).filter((id) => {
         const blocker = byId.get(id);
         return (
            blocker &&
            isLateDependency(
               { end: issueSpan(blocker).end, done: isDone(blocker) },
               issueSpan(issue).start
            )
         );
      });

   const datedMilestones = milestones.filter((milestone) => milestone.targetDate);

   if (issues.length === 0 && datedMilestones.length === 0) {
      return (
         <div className="h-full grid place-items-center text-sm text-muted-foreground">
            No issues to place on the timeline yet.
         </div>
      );
   }

   // One flat list of rows, all ROW_HEIGHT tall, so a dependency arrow finds a bar by row index.
   // VI: Một danh sách hàng phẳng, cùng chiều cao ROW_HEIGHT, để mũi tên tìm thanh theo chỉ số hàng.
   const rows: Row[] = [];
   if (groupBy === 'status' && datedMilestones.length > 0) rows.push({ kind: 'milestones' });
   const pushBranch = (
      issue: ProjectDetailUiIssue,
      depth: number,
      sort: SubIssueSort,
      color: string
   ) => {
      const children = orderedChildren(tree.children.get(issue.id) ?? [], sort, statuses);
      rows.push({ kind: 'issue', issue, depth, color, children });
      if (expandedParents.has(issue.id)) {
         for (const child of children) pushBranch(child, depth + 1, sort, color);
      }
   };
   for (const group of groups) {
      rows.push({ kind: 'group', group });
      if (collapsedGroups.has(group.key)) continue;
      for (const issue of group.issues) {
         pushBranch(issue, 0, issue.subIssueSort ?? 'manual', group.color);
      }
   }
   const rowOf = new Map(
      rows.flatMap((row, index) => (row.kind === 'issue' ? [[row.issue.id, index] as const] : []))
   );

   const save = async (id: string, start: string, end: string | null) => {
      const issue = byId.get(id);
      if (!issue) return false;
      const result = await rescheduleIssue(issue, start, end);
      if (result !== 'failed') onIssueChanged?.();
      return result === 'saved';
   };
   // shortcut: a bar dragged from "no end date" keeps the end it got on undo (the PATCH leaves a
   // null end untouched); clearing it needs the issue's date field.
   const undo = async () => {
      const last = history.at(-1);
      if (!last) return;
      setBusy(true);
      if (await save(last.id, last.start, last.end)) setHistory((current) => current.slice(0, -1));
      setBusy(false);
   };
   const reset = async () => {
      setBusy(true);
      const originals = new Map<string, (typeof history)[number]>();
      for (const entry of history) if (!originals.has(entry.id)) originals.set(entry.id, entry);
      for (const entry of originals.values()) await save(entry.id, entry.start, entry.end);
      setHistory([]);
      setBusy(false);
   };

   const toggle = (setter: typeof setCollapsedGroups, key: string) =>
      setter((current) => {
         const next = new Set(current);
         if (next.has(key)) next.delete(key);
         else next.add(key);
         return next;
      });

   const diamond = (milestone: Milestone, color: string, monthWidth: number) => {
      const day = milestone.targetDate!.slice(0, 10);
      const label = `${milestone.title} — ${shortDate(day)}${milestone.completedAt ? ' (completed)' : ''}`;
      return (
         <div
            key={milestone.id}
            className="absolute top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-[11px] whitespace-nowrap"
            // Centre the 10px diamond, not the whole label, on the target day.
            // VI: Canh giữa hình thoi 10px, không phải cả nhãn, đúng ngày mục tiêu.
            style={{ left: offsetFor(day, monthWidth) - 5 }}
            title={label}
            aria-label={label}
            data-testid="timeline-milestone"
         >
            <span
               className="size-2.5 rotate-45 rounded-[2px] shrink-0"
               style={{ backgroundColor: color }}
            />
            <span className="max-w-40 truncate font-medium">{milestone.title}</span>
            <span className="text-muted-foreground">{shortDate(day)}</span>
         </div>
      );
   };

   const listCell =
      'sticky left-0 z-10 flex items-center gap-1.5 w-56 shrink-0 pr-3 h-8 bg-container/95 backdrop-blur-sm border-r border-border/40';

   const renderRow = (row: Row, monthWidth: number) => {
      if (row.kind === 'milestones') {
         return (
            <div
               key="milestones"
               className="relative h-8 flex items-center border-b border-border/50"
            >
               {datedMilestones.map((milestone) =>
                  diamond(
                     milestone,
                     milestoneColors.get(milestone.id)?.color ?? NO_MILESTONE_COLOR,
                     monthWidth
                  )
               )}
               <div className={cn(listCell, 'pl-4 text-xs font-medium')}>
                  <span className="size-2 rotate-45 rounded-[1px] bg-muted-foreground" />
                  Milestones
               </div>
            </div>
         );
      }

      if (row.kind === 'group') {
         const { group } = row;
         const collapsed = collapsedGroups.has(group.key);
         const spans = group.issues.map(issueSpan);
         const start = spans.map((span) => span.start).sort()[0];
         const end = spans
            .map((span) => span.end ?? span.start)
            .sort()
            .at(-1);
         const progress = group.issues.length
            ? Math.round(
                 group.issues.reduce((sum, issue) => sum + progressOf(issue), 0) /
                    group.issues.length
              )
            : 0;
         const summary = start && end ? barGeometry(start, end, monthWidth) : null;
         return (
            <div
               key={`group-${group.key}`}
               className="relative h-8 flex items-center border-t border-border/50"
               data-testid="timeline-group"
            >
               {summary && (
                  <div
                     className="absolute h-1.5 rounded-full bg-foreground/10 overflow-hidden"
                     style={{ left: summary.left, width: summary.width }}
                     title={`${group.name}: ${progress}% done`}
                     aria-hidden="true"
                  >
                     <div
                        className="h-full rounded-full"
                        style={{ width: `${progress}%`, backgroundColor: group.color }}
                     />
                  </div>
               )}
               {group.milestone?.targetDate && diamond(group.milestone, group.color, monthWidth)}
               <div className={cn(listCell, 'pl-2 text-xs font-medium')}>
                  <button
                     type="button"
                     onClick={() => toggle(setCollapsedGroups, group.key)}
                     aria-expanded={!collapsed}
                     aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${group.name}`}
                     className="flex items-center gap-1.5 min-w-0 flex-1 text-left hover:text-foreground"
                  >
                     <ChevronRight
                        className={cn(
                           'size-3.5 shrink-0 text-muted-foreground transition-transform',
                           !collapsed && 'rotate-90'
                        )}
                     />
                     <span
                        className="size-2 rounded-full shrink-0"
                        style={{ backgroundColor: group.color }}
                     />
                     <span className="truncate">{group.name}</span>
                  </button>
                  <span className="text-muted-foreground tabular-nums">{group.issues.length}</span>
               </div>
            </div>
         );
      }

      const { issue, depth, color, children } = row;
      const expanded = expandedParents.has(issue.id);
      const { start, end } = issueSpan(issue);
      const { left, width } = barGeometry(start, end, monthWidth);
      const overdue = !isDone(issue) && !!today && !!end && end < today;
      const late = lateBlockers(issue);
      const risk = overdue
         ? `Overdue since ${shortDate(end!)}`
         : late.length > 0
           ? `Blocked by ${late.map((id) => byId.get(id)?.identifier).join(', ')}, planned to end after this starts`
           : null;
      return (
         <div key={issue.id} className="relative h-8 flex items-center">
            <TimelineIssueBar
               left={left}
               width={width}
               color={color}
               dashed={!end}
               title={issue.title}
               label={`${issue.identifier} · ${issue.title} — ${rangeLabel(issue)}`}
               progress={progressOf(issue)}
               onClick={() => setPeekIssueId((current) => (current === issue.id ? null : issue.id))}
               schedule={
                  canEdit
                     ? {
                          start,
                          end,
                          monthWidth,
                          dayWidth: dayWidthOf(monthWidth),
                          onChange: async (nextStart, nextEnd) => {
                             const saved = await save(issue.id, nextStart, nextEnd);
                             if (saved)
                                setHistory((current) => [...current, { id: issue.id, start, end }]);
                             return saved;
                          },
                       }
                     : undefined
               }
            />
            <div
               className={cn(listCell, 'text-xs')}
               style={{ paddingLeft: 8 + depth * 16 }}
               title={`${issue.identifier} · ${issue.title}`}
            >
               {children.length > 0 ? (
                  <button
                     type="button"
                     aria-label={
                        expanded
                           ? `Hide sub-issues of ${issue.title}`
                           : `Show sub-issues of ${issue.title}`
                     }
                     aria-expanded={expanded}
                     onClick={() => toggle(setExpandedParents, issue.id)}
                     className="text-muted-foreground hover:text-foreground"
                  >
                     <ChevronRight
                        className={cn('size-3.5 transition-transform', expanded && 'rotate-90')}
                     />
                  </button>
               ) : (
                  <span className="size-3.5 shrink-0" aria-hidden="true" />
               )}
               {issue.assignee ? (
                  <Avatar className="size-4 shrink-0">
                     <AvatarImage src={issue.assignee.avatarUrl} alt={issue.assignee.name} />
                     <AvatarFallback className="text-[9px]">
                        {issue.assignee.name[0]}
                     </AvatarFallback>
                  </Avatar>
               ) : (
                  <span
                     className="size-4 shrink-0 rounded-full border border-dashed border-muted-foreground/50"
                     aria-label="Unassigned"
                  />
               )}
               <span className="truncate flex-1 text-muted-foreground">{issue.title}</span>
               {risk && (
                  <span role="img" aria-label={risk} title={risk} className="shrink-0">
                     <CircleAlert className="size-3.5 text-red-500" />
                  </span>
               )}
               {end && (
                  <span
                     className={cn(
                        'shrink-0 tabular-nums text-[11px] text-muted-foreground',
                        overdue && 'text-red-500'
                     )}
                  >
                     {shortDate(end)}
                  </span>
               )}
            </div>
         </div>
      );
   };

   const arrows = (monthWidth: number) =>
      rows.flatMap((row, index) => {
         if (row.kind !== 'issue') return [];
         const blocked = row.issue;
         const { start: blockedStart, end: blockedEnd } = issueSpan(blocked);
         const x2 = barGeometry(blockedStart, blockedEnd, monthWidth).left;
         const late = new Set(lateBlockers(blocked));
         return (blocked.blockedBy ?? []).flatMap((id) => {
            const from = rowOf.get(id);
            const blocker = byId.get(id);
            if (from === undefined || !blocker) return [];
            const span = issueSpan(blocker);
            const box = barGeometry(span.start, span.end, monthWidth);
            const isLate = late.has(id);
            return [
               <path
                  key={`${id}-${blocked.id}`}
                  d={dependencyPath(
                     box.left + box.width,
                     from * ROW_HEIGHT + ROW_HEIGHT / 2,
                     x2,
                     index * ROW_HEIGHT + ROW_HEIGHT / 2,
                     ROW_HEIGHT
                  )}
                  className={isLate ? 'stroke-red-500' : 'stroke-muted-foreground'}
                  markerEnd={isLate ? 'url(#gantt-arrow-late)' : 'url(#gantt-arrow)'}
                  data-testid={isLate ? 'timeline-dependency-late' : 'timeline-dependency'}
               />,
            ];
         });
      });

   const groupByLabel = groupBy === 'milestone' ? 'By milestone' : 'By status';

   return (
      <>
         {peekIssueId !== null && (
            <IssuePeekPanel
               issueId={peekIssueId}
               onClose={() => setPeekIssueId(null)}
               onChanged={onIssueChanged}
            />
         )}
         <TimelineFrame
            className="h-full"
            toolbarStart={
               <>
                  {canEdit && (
                     <span className="mr-auto hidden md:inline text-xs text-muted-foreground">
                        Drag a bar to move it, or its edges to change dates
                     </span>
                  )}
                  {history.length > 0 && (
                     <>
                        <Button
                           size="xs"
                           variant="ghost"
                           className="gap-1"
                           disabled={busy}
                           onClick={() => void undo()}
                        >
                           <Undo2 className="size-3.5" />
                           Undo
                        </Button>
                        <Button
                           size="xs"
                           variant="ghost"
                           className="gap-1"
                           disabled={busy}
                           onClick={() => void reset()}
                        >
                           <RotateCcw className="size-3.5" />
                           Reset
                        </Button>
                     </>
                  )}
                  <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                        <Button size="xs" variant="outline" className="gap-1">
                           {groupByLabel}
                           <ChevronDown className="size-3.5" />
                        </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                        {(['milestone', 'status'] as const).map((option) => (
                           <DropdownMenuItem key={option} onClick={() => setGroupBy(option)}>
                              {option === 'milestone' ? 'By milestone' : 'By status'}
                              {option === groupBy && <Check className="ml-auto size-4" />}
                           </DropdownMenuItem>
                        ))}
                     </DropdownMenuContent>
                  </DropdownMenu>
               </>
            }
         >
            {(monthWidth) => (
               <>
                  <svg
                     className="absolute inset-x-0 top-0 pointer-events-none fill-none overflow-visible"
                     width="100%"
                     height={rows.length * ROW_HEIGHT}
                     aria-hidden="true"
                  >
                     <defs>
                        {(['gantt-arrow', 'gantt-arrow-late'] as const).map((id) => (
                           <marker
                              key={id}
                              id={id}
                              viewBox="0 0 6 6"
                              refX="5"
                              refY="3"
                              markerWidth="6"
                              markerHeight="6"
                              orient="auto"
                           >
                              <path
                                 d="M0 0L6 3L0 6"
                                 className={cn(
                                    'fill-none',
                                    id === 'gantt-arrow-late'
                                       ? 'stroke-red-500'
                                       : 'stroke-muted-foreground'
                                 )}
                              />
                           </marker>
                        ))}
                     </defs>
                     {arrows(monthWidth)}
                  </svg>
                  {rows.map((row) => renderRow(row, monthWidth))}
               </>
            )}
         </TimelineFrame>
      </>
   );
}
