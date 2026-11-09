'use client';

import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useIssuesStore } from '@/store/issues-store';
import { authenticatedFetch } from '@/lib/workspaces';
import { directProgress, issueTree } from '@/lib/issue-tree';
import {
   Check,
   ChevronRight,
   ChevronsDownUp,
   ChevronsUpDown,
   Circle,
   CircleCheck,
   CircleDashed,
   CircleX,
   GanttChart,
   List,
   ListPlus,
   Plus,
   TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AssigneeUser } from '../assignee-user';
import { IssueDateCell } from '../issue-inline-cells';
import type { User } from '@/types/users';
import { IssueSearchDialog } from './issue-search-dialog';
import { Selector } from '@astryxdesign/core/Selector';
import { DesignSurface } from '@/components/common/design-surface';
import { moveInList } from '@/features/manual-order/order';
import { sortSubIssues, type SubIssueSort } from '@/features/manual-order/sub-issue-sort';
import { ReorderRow, ReorderProvider } from '@/features/manual-order/reorder-row';
import { outsideParent } from '@/lib/issue-span';
import type { Issue } from '@/types/issues';
import { rescheduleIssue, useCanEditIssues } from '@/components/common/timeline/reschedule';
import { IssueSubIssuesTimeline, type TimelineSubIssueRow } from './issue-sub-issues-timeline';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type SubIssueStatus = { id: string; name: string; color: string; category: string };

type SubIssue = {
   manualOrder?: string;
   id: string;
   identifier: string;
   title: string;
   parentIssueId: string | null;
   dueDate: string | null;
   startDate: string | null;
   targetDate: string | null;
   createdAt: string;
   version: number;
   status: SubIssueStatus;
   assignee: { id: string; name: string; avatarUrl: string | null } | null;
};

const asUser = (assignee: SubIssue['assignee']): User | null =>
   assignee
      ? {
           id: assignee.id,
           name: assignee.name,
           avatarUrl: assignee.avatarUrl ?? '',
           email: '',
           status: 'offline',
           role: 'Member',
           joinedDate: '',
           teamIds: [],
           timezone: 'UTC',
        }
      : null;

const StatusIcon = ({ status }: { status: SubIssueStatus }) => {
   const category = status.category.toLowerCase();
   const Icon =
      category === 'completed'
         ? CircleCheck
         : category === 'canceled'
           ? CircleX
           : category === 'backlog' || category === 'triage'
             ? CircleDashed
             : Circle;
   return <Icon className="size-4 shrink-0" style={{ color: status.color }} />;
};

const ProgressBadge = ({ items }: { items: SubIssue[] | undefined }) => {
   const { completed, total } = directProgress(items);
   if (!total) return null;
   return (
      <span
         className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"
         title="Completed / total direct sub-issues"
      >
         <span className="h-1.5 w-10 overflow-hidden rounded-full bg-muted">
            <span
               className="block h-full bg-green-500"
               style={{ width: `${(completed / total) * 100}%` }}
            />
         </span>
         {completed}/{total}
      </span>
   );
};

// Past its end (target end, else due date) and still open. VI: Đã qua ngày kết thúc mà chưa xong.
const isOverdue = (subIssue: SubIssue) => {
   const end = subIssue.targetDate ?? subIssue.dueDate;
   return (
      Boolean(end) &&
      !['completed', 'canceled'].includes(subIssue.status.category.toLowerCase()) &&
      new Date(end as string) < new Date(new Date().toDateString())
   );
};

/** Amber warning for a sub-issue outside the open issue's dates; keeps its column when hidden.
 * VI: Cảnh báo cam cho sub-issue nằm ngoài các ngày của issue đang mở; ẩn vẫn giữ chỗ cột. */
const OutsideMark = ({ show, identifier }: { show: boolean; identifier: string }) => (
   <span className="flex size-4 shrink-0 items-center justify-center">
      {show && (
         <TriangleAlert
            className="size-3.5 text-amber-500"
            role="img"
            aria-label={`Outside ${identifier}'s dates`}
         >
            <title>{`Outside ${identifier}'s dates`}</title>
         </TriangleAlert>
      )}
   </span>
);

/**
 * Issue-detail sub-issue area backed by the parent-child Issue relationship. It loads every level
 * of descendants and shows them as an indented tree (Redmine style): each row has its own
 * expand/collapse toggle, status, progress of its direct children, start and end dates and
 * assignee. Status, dates and assignee are edited in place through PATCH /issues/{id}; the status
 * icon opens a menu of the team's statuses, and since every row shares the open issue's team, one
 * options request serves the whole tree. All levels start expanded. A sub-issue is created new or
 * picked from existing issues ("Add existing"); picking one that has another parent asks to
 * confirm the move. Progress counts direct children only.
 *
 * The first row is the open issue itself with its own dates. A sub-issue whose bar leaves the open
 * issue's dates shows an amber warning. The sort is saved on the open issue (`subIssueSort`), so
 * every viewer and the project Timeline use it. The Timeline mode draws the same visible rows
 * (same sort, same collapsed branches) on a date scale where members who may edit drag bars to
 * change dates; saves send the version read, and a conflict reloads instead of overwriting.
 * VI: Khu sub-issue của chi tiết issue, dựa trên quan hệ cha–con. Khu này tải mọi cấp hậu duệ và
 * VI: hiển thị thành cây thụt lề (kiểu Redmine): mỗi hàng có nút mở/thu riêng, trạng thái, tiến độ
 * VI: theo con trực tiếp, due date và assignee. Trạng thái, due date và assignee sửa ngay tại chỗ qua
 * VI: PATCH /issues/{id}; icon trạng thái mở menu các trạng thái của team, và vì mọi hàng cùng team
 * VI: với issue đang mở nên một request options đủ cho cả cây. Mọi cấp mặc định mở. Sub-issue được
 * VI: tạo mới hoặc chọn từ issue có sẵn ("Add existing"); chọn issue đang có cha khác sẽ hỏi xác
 * VI: nhận chuyển. Tiến độ chỉ tính con trực tiếp.
 * VI:
 * VI: Hàng đầu tiên là chính issue đang mở với các ngày của nó. Sub-issue có thanh vượt khỏi các
 * VI: ngày của issue đang mở hiện cảnh báo màu cam. Sort được lưu trên issue đang mở
 * VI: (`subIssueSort`) nên mọi người xem và Timeline project dùng cùng thứ tự. Chế độ Timeline vẽ
 * VI: đúng các hàng đang hiển thị (cùng sort, cùng nhánh đang thu) trên thang ngày, nơi thành viên
 * VI: có quyền sửa kéo thanh để đổi ngày; lần lưu gửi version đã đọc, xung đột thì tải lại thay vì
 * VI: ghi đè.
 */
export function IssueSubIssues({
   issue,
   issueId,
   identifier,
   teamId,
   orgId,
}: {
   issue: Issue;
   issueId: string;
   identifier: string;
   teamId?: string;
   orgId: string;
}) {
   const {
      workspaceId,
      retryIssues,
      setIssueParent,
      updateIssueSchedule,
      updateIssueSubIssueSort,
   } = useIssuesStore();
   const router = useRouter();
   const canEdit = useCanEditIssues();
   const [mode, setMode] = useState<'list' | 'timeline'>('list');
   const [pickerOpen, setPickerOpen] = useState(false);
   const [subIssues, setSubIssues] = useState<SubIssue[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [dialogOpen, setDialogOpen] = useState(false);
   const [title, setTitle] = useState('');
   const [description, setDescription] = useState('');
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
   const savedSort = issue.subIssueSort ?? 'manual';
   const [sort, setSort] = useState<SubIssueSort>(savedSort);
   const [statuses, setStatuses] = useState<SubIssueStatus[]>([]);
   const { roots, children } = useMemo(() => issueTree(subIssues), [subIssues]);
   const outside = (subIssue: SubIssue) => outsideParent(subIssue, issue);

   // The saved rule wins whenever the open issue reloads (another viewer may have changed it).
   // VI: Quy tắc đã lưu được áp dụng mỗi khi issue đang mở tải lại (người khác có thể đã đổi).
   useEffect(() => setSort(savedSort), [savedSort]);

   const changeSort = async (next: SubIssueSort) => {
      setSort(next);
      if (!(await updateIssueSubIssueSort(issueId, next))) setSort(savedSort);
   };

   useEffect(() => {
      if (!workspaceId) return;
      // Sub-issues share the open issue's team (or have none), so its statuses are the only valid
      // picks. On failure the menu stays empty and nothing can be changed.
      // VI: Sub-issue cùng team với issue đang mở (hoặc cùng không có team) nên chỉ trạng thái của
      // VI: team đó là hợp lệ. Lỗi thì menu rỗng và không đổi được gì.
      const query = new URLSearchParams({ workspaceId });
      if (teamId) query.set('teamId', teamId);
      else query.set('noTeam', 'true');
      void authenticatedFetch(`${api}/issues/options?${query}`)
         .then((response) => (response.ok ? response.json() : null))
         .then((payload: { data: { statuses: SubIssueStatus[] } } | null) =>
            setStatuses(payload?.data.statuses ?? [])
         )
         .catch(() => setStatuses([]));
   }, [teamId, workspaceId]);

   const load = useCallback(async () => {
      if (!workspaceId) return;
      const query = new URLSearchParams({ workspaceId, descendants: 'true' });
      const response = await authenticatedFetch(`${api}/issues/${issueId}/sub-issues?${query}`);
      if (!response.ok) throw new Error('Could not load sub-issues.');
      const payload = (await response.json()) as { data: SubIssue[] };
      setSubIssues(payload.data);
   }, [issueId, workspaceId]);

   useEffect(() => {
      if (!workspaceId) return;
      setState('loading');
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load, workspaceId]);

   useEffect(() => {
      const reload = () => void load().catch(() => setState('error'));
      window.addEventListener('flowie:sub-issues-changed', reload);
      return () => window.removeEventListener('flowie:sub-issues-changed', reload);
   }, [load]);

   const patchSubIssue = async (id: string, body: Record<string, unknown>) => {
      if (!workspaceId) return false;
      const response = await authenticatedFetch(
         `${api}/issues/${id}?${new URLSearchParams({ workspaceId })}`,
         {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
         }
      );
      if (!response.ok) {
         const payload = (await response.json().catch(() => null)) as { message?: string } | null;
         toast.error(payload?.message ?? 'Could not update the sub-issue.');
         return false;
      }
      await load().catch(() => setState('error'));
      return true;
   };

   const toggle = (id: string) =>
      setCollapsed((current) => {
         const next = new Set(current);
         if (!next.delete(id)) next.add(id);
         return next;
      });

   const renderRows = (items: SubIssue[], depth: number): ReactNode =>
      sortSubIssues(items, sort, statuses).map((subIssue) => {
         const nested = children.get(subIssue.id);
         const open = !collapsed.has(subIssue.id);
         return (
            <ReorderRow
               key={subIssue.id}
               item={subIssue}
               items={items}
               name={subIssue.identifier}
               entityType="issue"
               scope={`sub:${workspaceId}:${subIssue.parentIssueId}`}
               workspaceId={workspaceId}
               enabled={state === 'ready' && sort === 'manual'}
               optimistic={(source, target, placement) =>
                  setSubIssues((current) => moveInList(current, source, target, placement))
               }
               refresh={load}
            >
               <div
                  className="w-full flex items-center gap-2 h-10 pr-1 border-b border-border/50 hover:bg-sidebar/50 text-sm min-w-0"
                  style={{ paddingLeft: depth * 20 + 4 }}
                  data-testid="sub-issue-row"
               >
                  {nested ? (
                     <button
                        type="button"
                        onClick={() => toggle(subIssue.id)}
                        aria-expanded={open}
                        aria-label={`${open ? 'Collapse' : 'Expand'} ${subIssue.identifier}`}
                        className="flex size-4 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                     >
                        <ChevronRight
                           className={`size-3.5 transition-transform ${open ? 'rotate-90' : ''}`}
                        />
                     </button>
                  ) : (
                     <span className="size-4 shrink-0" />
                  )}
                  <DropdownMenu>
                     <DropdownMenuTrigger
                        aria-label={`Change status of ${subIssue.identifier}`}
                        title={subIssue.status.name}
                        className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-accent"
                     >
                        <StatusIcon status={subIssue.status} />
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="start" className="min-w-44">
                        {statuses.map((status) => (
                           <DropdownMenuItem
                              key={status.id}
                              onSelect={() => {
                                 if (status.id !== subIssue.status.id)
                                    void patchSubIssue(subIssue.id, { statusId: status.id });
                              }}
                           >
                              <StatusIcon status={status} />
                              {status.name}
                              {status.id === subIssue.status.id && (
                                 <Check className="ml-auto size-4" />
                              )}
                           </DropdownMenuItem>
                        ))}
                        {statuses.length === 0 && (
                           <p className="px-2 py-1.5 text-sm text-muted-foreground">
                              No statuses available.
                           </p>
                        )}
                     </DropdownMenuContent>
                  </DropdownMenu>
                  <Link
                     href={`/${orgId}/issue/${subIssue.identifier}`}
                     className="flex min-w-0 flex-1 items-center gap-2"
                  >
                     <span className="text-muted-foreground shrink-0 text-xs font-medium">
                        {subIssue.identifier}
                     </span>
                     <span className="truncate font-medium">{subIssue.title}</span>
                  </Link>
                  <ProgressBadge items={nested} />
                  <OutsideMark show={outside(subIssue)} identifier={identifier} />
                  <span className="w-20 shrink-0">
                     <IssueDateCell
                        issueId={subIssue.id}
                        value={subIssue.startDate?.slice(0, 10)}
                        kind="start"
                        onSave={(startDate) =>
                           patchSubIssue(subIssue.id, { startDate: startDate ?? null })
                        }
                     />
                  </span>
                  <span className="w-20 shrink-0">
                     <IssueDateCell
                        issueId={subIssue.id}
                        value={subIssue.targetDate?.slice(0, 10)}
                        kind="target"
                        accent={isOverdue(subIssue)}
                        onSave={(targetDate) =>
                           patchSubIssue(subIssue.id, { targetDate: targetDate ?? null })
                        }
                     />
                  </span>
                  <span className="shrink-0">
                     <AssigneeUser
                        user={asUser(subIssue.assignee)}
                        issueId={subIssue.id}
                        onAssign={(assignee) =>
                           patchSubIssue(subIssue.id, { assigneeId: assignee?.id ?? null })
                        }
                     />
                  </span>
               </div>
               {nested && open && renderRows(nested, depth + 1)}
            </ReorderRow>
         );
      });

   // The rows the Timeline draws: the open issue, then the visible tree in the current sort.
   // VI: Các hàng Timeline vẽ: issue đang mở, rồi cây đang hiển thị theo sort hiện tại.
   const timelineRows = (): TimelineSubIssueRow[] => {
      const rows: TimelineSubIssueRow[] = [
         { issue, depth: -1, hasChildren: false, open: true, outside: false },
      ];
      const walk = (items: SubIssue[], depth: number) => {
         for (const subIssue of sortSubIssues(items, sort, statuses)) {
            const nested = children.get(subIssue.id);
            const open = !collapsed.has(subIssue.id);
            rows.push({
               issue: subIssue,
               depth,
               hasChildren: Boolean(nested),
               open,
               outside: outside(subIssue),
            });
            if (nested && open) walk(nested, depth + 1);
         }
      };
      walk(roots, 0);
      return rows;
   };

   // The open issue saves through the store (its page reads it from there); sub-issues save
   // directly and reload the tree, also after a conflict so the bar shows the current dates.
   // VI: Issue đang mở lưu qua store (trang đọc nó từ đó); sub-issue lưu trực tiếp rồi tải lại
   // VI: cây, kể cả khi xung đột để thanh hiện đúng ngày hiện tại.
   const reschedule = async (target: { id: string }, start: string, end: string | null) => {
      if (target.id === issueId)
         return updateIssueSchedule(issueId, {
            startDate: start,
            targetDate: end ?? undefined,
            expectedVersion: issue.version,
         });
      const subIssue = subIssues.find((item) => item.id === target.id);
      if (!subIssue) return false;
      const result = await rescheduleIssue(subIssue, start, end);
      if (result !== 'failed') await load().catch(() => setState('error'));
      return result === 'saved';
   };

   const createSubIssue = async () => {
      if (!workspaceId || title.trim().length < 2) return;
      setSaving(true);
      setError(undefined);
      try {
         const response = await authenticatedFetch(`${api}/issues`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId,
               teamId,
               parentIssueId: issueId,
               title: title.trim(),
               description: description.trim() || undefined,
            }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not create sub-issue.');
         }
         await Promise.all([load(), retryIssues()]);
         setDialogOpen(false);
         setTitle('');
         setDescription('');
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not create sub-issue.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <section className="mt-6">
         {state === 'loading' && (
            <p className="mt-3 text-sm text-muted-foreground">Loading sub-issues…</p>
         )}
         {state === 'error' && (
            <p className="mt-3 text-sm text-destructive">Could not load sub-issues.</p>
         )}
         {state === 'ready' && subIssues.length === 0 && (
            <div className="flex items-center gap-4">
               <button
                  type="button"
                  onClick={() => setDialogOpen(true)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
               >
                  <Plus className="size-4" />
                  Add sub-issues
               </button>
               <button
                  type="button"
                  onClick={() => setPickerOpen(true)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
               >
                  <ListPlus className="size-4" />
                  Add existing
               </button>
            </div>
         )}
         {state === 'ready' && subIssues.length > 0 && (
            <>
               <div className="flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-medium mb-1">
                     Sub-issues <ProgressBadge items={roots} />
                  </h2>
                  <div className="flex items-center gap-1">
                     <div
                        className="flex items-center rounded-md border p-0.5"
                        role="group"
                        aria-label="Sub-issue view"
                     >
                        {(
                           [
                              ['list', List, 'List'],
                              ['timeline', GanttChart, 'Timeline'],
                           ] as const
                        ).map(([value, Icon, label]) => (
                           <Button
                              key={value}
                              size="xs"
                              variant={mode === value ? 'secondary' : 'ghost'}
                              aria-pressed={mode === value}
                              onClick={() => setMode(value)}
                           >
                              <Icon className="size-3.5" /> {label}
                           </Button>
                        ))}
                     </div>
                     <DesignSurface>
                        <Selector
                           label="Sort sub-issues"
                           isLabelHidden
                           size="sm"
                           variant="ghost"
                           value={sort}
                           onChange={(value) => void changeSort(value as SubIssueSort)}
                           options={[
                              { value: 'manual', label: 'Sort: Manual' },
                              { value: 'identifier-asc', label: 'Issue ID ascending' },
                              { value: 'identifier-desc', label: 'Issue ID descending' },
                              { value: 'status-asc', label: 'Status ascending' },
                              { value: 'status-desc', label: 'Status descending' },
                           ]}
                        />
                     </DesignSurface>
                     {children.size > 0 && (
                        <Button
                           size="xs"
                           variant="ghost"
                           onClick={() =>
                              setCollapsed(collapsed.size ? new Set() : new Set(children.keys()))
                           }
                        >
                           {collapsed.size ? (
                              <>
                                 <ChevronsUpDown className="size-3.5" /> Expand all
                              </>
                           ) : (
                              <>
                                 <ChevronsDownUp className="size-3.5" /> Collapse all
                              </>
                           )}
                        </Button>
                     )}
                     <Button size="xs" variant="ghost" onClick={() => setDialogOpen(true)}>
                        <Plus className="size-3.5" /> New
                     </Button>
                     <Button size="xs" variant="ghost" onClick={() => setPickerOpen(true)}>
                        <ListPlus className="size-3.5" /> Add existing
                     </Button>
                  </div>
               </div>
               {mode === 'timeline' ? (
                  <IssueSubIssuesTimeline
                     rows={timelineRows()}
                     parentIdentifier={identifier}
                     onToggle={toggle}
                     onOpen={(target) => {
                        if (target.id !== issueId)
                           router.push(`/${orgId}/issue/${target.identifier}`);
                     }}
                     onReschedule={canEdit ? reschedule : undefined}
                  />
               ) : (
                  <ReorderProvider>
                     <div className="flex flex-col border-t border-border/50">
                        <div
                           className="w-full flex items-center gap-2 h-10 pl-1 pr-1 border-b border-border/50 bg-sidebar/40 text-sm min-w-0"
                           data-testid="sub-issue-parent-row"
                        >
                           <span className="size-4 shrink-0" />
                           <StatusIcon status={issue.status} />
                           <span className="text-muted-foreground shrink-0 text-xs font-medium">
                              {issue.identifier}
                           </span>
                           <span className="truncate font-semibold flex-1">{issue.title}</span>
                           <ProgressBadge items={roots} />
                           <span className="size-4 shrink-0" />
                           <span className="w-20 shrink-0">
                              <IssueDateCell
                                 issueId={issue.id}
                                 value={issue.startDate?.slice(0, 10)}
                                 kind="start"
                              />
                           </span>
                           <span className="w-20 shrink-0">
                              <IssueDateCell
                                 issueId={issue.id}
                                 value={issue.targetDate?.slice(0, 10)}
                                 kind="target"
                              />
                           </span>
                           <span className="w-6 shrink-0" />
                        </div>
                        {renderRows(roots, 0)}
                     </div>
                  </ReorderProvider>
               )}
            </>
         )}

         <IssueSearchDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            title="Add existing sub-issue"
            description="Pick an issue of this team to place under this issue."
            teamId={teamId}
            excludeIds={[issueId, ...roots.map((subIssue) => subIssue.id)]}
            moveTarget={{ id: issueId, identifier }}
            onPick={async (picked) => {
               await setIssueParent(picked.id, issueId);
            }}
         />

         <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-[480px]">
               <DialogHeader>
                  <DialogTitle>New sub-issue</DialogTitle>
                  <DialogDescription>Create an issue under this parent issue.</DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <Input
                     value={title}
                     onChange={(event) => setTitle(event.target.value)}
                     placeholder="Sub-issue title"
                     autoFocus
                  />
                  <Textarea
                     value={description}
                     onChange={(event) => setDescription(event.target.value)}
                     placeholder="Description (optional)"
                  />
                  {error && <p className="text-sm text-destructive">{error}</p>}
               </div>
               <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                     Cancel
                  </Button>
                  <Button
                     onClick={() => void createSubIssue()}
                     disabled={saving || title.trim().length < 2}
                  >
                     {saving ? 'Creating…' : 'Create sub-issue'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </section>
   );
}
