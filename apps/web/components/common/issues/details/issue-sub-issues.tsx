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
   ListPlus,
   Plus,
} from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AssigneeUser } from '../assignee-user';
import { IssueDateCell } from '../issue-inline-cells';
import type { User } from '@/mock-data/users';
import { IssueSearchDialog } from './issue-search-dialog';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type SubIssueStatus = { id: string; name: string; color: string; category: string };

type SubIssue = {
   id: string;
   identifier: string;
   title: string;
   parentIssueId: string | null;
   dueDate: string | null;
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

const isOverdue = (subIssue: SubIssue) =>
   Boolean(subIssue.dueDate) &&
   !['completed', 'canceled'].includes(subIssue.status.category.toLowerCase()) &&
   new Date(subIssue.dueDate as string) < new Date(new Date().toDateString());

/**
 * Issue-detail sub-issue area backed by the parent-child Issue relationship. It loads every level
 * of descendants and shows them as an indented tree (Redmine style): each row has its own
 * expand/collapse toggle, status, progress of its direct children, due date and assignee. Status,
 * due date and assignee are edited in place through PATCH /issues/{id}; the status icon opens a
 * menu of the team's statuses, and since every row shares the open issue's team, one options
 * request serves the whole tree. All levels start expanded. A sub-issue is created new or picked
 * from existing issues ("Add existing"); picking one that has another parent asks to confirm the
 * move. Progress counts direct children only.
 * VI: Khu sub-issue của chi tiết issue, dựa trên quan hệ cha–con. Khu này tải mọi cấp hậu duệ và
 * VI: hiển thị thành cây thụt lề (kiểu Redmine): mỗi hàng có nút mở/thu riêng, trạng thái, tiến độ
 * VI: theo con trực tiếp, due date và assignee. Trạng thái, due date và assignee sửa ngay tại chỗ qua
 * VI: PATCH /issues/{id}; icon trạng thái mở menu các trạng thái của team, và vì mọi hàng cùng team
 * VI: với issue đang mở nên một request options đủ cho cả cây. Mọi cấp mặc định mở. Sub-issue được
 * VI: tạo mới hoặc chọn từ issue có sẵn ("Add existing"); chọn issue đang có cha khác sẽ hỏi xác
 * VI: nhận chuyển. Tiến độ chỉ tính con trực tiếp.
 */
export function IssueSubIssues({
   issueId,
   identifier,
   teamId,
   orgId,
}: {
   issueId: string;
   identifier: string;
   teamId?: string;
   orgId: string;
}) {
   const { workspaceId, retryIssues, setIssueParent } = useIssuesStore();
   const [pickerOpen, setPickerOpen] = useState(false);
   const [subIssues, setSubIssues] = useState<SubIssue[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [dialogOpen, setDialogOpen] = useState(false);
   const [title, setTitle] = useState('');
   const [description, setDescription] = useState('');
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
   const [statuses, setStatuses] = useState<SubIssueStatus[]>([]);
   const { roots, children } = useMemo(() => issueTree(subIssues), [subIssues]);

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
      items.map((subIssue) => {
         const nested = children.get(subIssue.id);
         const open = !collapsed.has(subIssue.id);
         return (
            <div key={subIssue.id}>
               <div
                  className="flex items-center gap-2 h-10 pr-1 border-b border-border/50 hover:bg-sidebar/50 text-sm min-w-0"
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
                  <span className="w-20 shrink-0">
                     <IssueDateCell
                        issueId={subIssue.id}
                        value={subIssue.dueDate ?? undefined}
                        kind="due"
                        accent={isOverdue(subIssue)}
                        onSave={(dueDate) =>
                           patchSubIssue(subIssue.id, { dueDate: dueDate ?? null })
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
            </div>
         );
      });

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
               <div className="flex flex-col border-t border-border/50">{renderRows(roots, 0)}</div>
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
