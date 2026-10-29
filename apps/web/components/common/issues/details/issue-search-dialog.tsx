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
import { Input } from '@/components/ui/input';
import { authenticatedFetch } from '@/lib/workspaces';
import { useIssuesStore } from '@/store/issues-store';
import { useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type IssueCandidate = {
   id: string;
   identifier: string;
   title: string;
   status: { name: string; color: string };
   parent: { id: string; identifier: string; title: string } | null;
};

/**
 * Finds an issue of the same team by identifier or title for a parent–child change. Each result
 * shows its status and current parent so the right issue is picked. With `moveTarget`, picking an
 * issue that already has another parent asks to confirm the move instead of saving at once. Server
 * errors (cycle, other team, archived parent) are shown in the dialog.
 * VI: Tìm issue cùng team theo mã hoặc tiêu đề để đổi quan hệ cha–con. Mỗi kết quả hiện trạng thái
 * VI: và cha hiện tại để chọn đúng issue. Có `moveTarget` thì chọn issue đang thuộc cha khác sẽ hỏi
 * VI: xác nhận chuyển thay vì lưu ngay. Lỗi từ server (chu trình, khác team, cha đã archive) hiển
 * VI: thị trong hộp thoại.
 */
export function IssueSearchDialog({
   open,
   onOpenChange,
   title,
   description,
   teamId,
   excludeIds,
   moveTarget,
   onPick,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   title: string;
   description: string;
   teamId?: string;
   excludeIds: string[];
   moveTarget?: { id: string; identifier: string };
   onPick: (issue: IssueCandidate) => Promise<void>;
}) {
   const workspaceId = useIssuesStore((state) => state.workspaceId);
   const [query, setQuery] = useState('');
   const [results, setResults] = useState<IssueCandidate[]>([]);
   const [pending, setPending] = useState<IssueCandidate>();
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   useEffect(() => {
      if (!open || !workspaceId) return;
      const timer = window.setTimeout(() => {
         const params = new URLSearchParams({ workspaceId, query: query.trim(), limit: '20' });
         if (teamId) params.set('teamId', teamId);
         else params.set('noTeam', 'true');
         void authenticatedFetch(`${api}/issues?${params}`)
            .then(async (response) => {
               if (!response.ok) throw new Error('Could not search issues.');
               setResults(((await response.json()) as { data: IssueCandidate[] }).data);
            })
            .catch((caught: Error) => setError(caught.message));
      }, 250);
      return () => window.clearTimeout(timer);
   }, [open, query, teamId, workspaceId]);

   const close = (next: boolean) => {
      onOpenChange(next);
      if (!next) {
         setQuery('');
         setPending(undefined);
         setError(undefined);
      }
   };

   const save = async (issue: IssueCandidate) => {
      setSaving(true);
      setError(undefined);
      try {
         await onPick(issue);
         close(false);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not change the parent issue.');
      } finally {
         setSaving(false);
      }
   };

   const pick = (issue: IssueCandidate) => {
      if (moveTarget && issue.parent && issue.parent.id !== moveTarget.id) setPending(issue);
      else void save(issue);
   };

   const visible = results.filter((issue) => !excludeIds.includes(issue.id));

   return (
      <Dialog open={open} onOpenChange={close}>
         <DialogContent className="sm:max-w-[520px]">
            <DialogHeader>
               <DialogTitle>{pending ? 'Move sub-issue?' : title}</DialogTitle>
               <DialogDescription>
                  {pending && moveTarget
                     ? `${pending.identifier} is a sub-issue of ${pending.parent?.identifier}. Move it under ${moveTarget.identifier}?`
                     : description}
               </DialogDescription>
            </DialogHeader>
            {!pending && (
               <div className="space-y-2">
                  <Input
                     value={query}
                     onChange={(event) => setQuery(event.target.value)}
                     placeholder="Search by ID or title"
                     aria-label="Search issues"
                     autoFocus
                  />
                  <div className="max-h-72 overflow-y-auto flex flex-col" role="list">
                     {visible.length === 0 && (
                        <p className="px-1 py-3 text-sm text-muted-foreground">No issues found.</p>
                     )}
                     {visible.map((issue) => (
                        <button
                           key={issue.id}
                           type="button"
                           role="listitem"
                           disabled={saving}
                           onClick={() => pick(issue)}
                           className="flex items-center gap-2 h-9 px-1 rounded-md text-left text-sm hover:bg-sidebar/60 min-w-0"
                        >
                           <span
                              className="size-2 rounded-full shrink-0"
                              style={{ backgroundColor: issue.status.color }}
                              aria-label={issue.status.name}
                           />
                           <span className="text-xs font-medium text-muted-foreground shrink-0">
                              {issue.identifier}
                           </span>
                           <span className="truncate">{issue.title}</span>
                           {issue.parent && (
                              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                                 in {issue.parent.identifier}
                              </span>
                           )}
                        </button>
                     ))}
                  </div>
               </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
            {pending && (
               <DialogFooter>
                  <Button variant="outline" onClick={() => setPending(undefined)} disabled={saving}>
                     Back
                  </Button>
                  <Button onClick={() => void save(pending)} disabled={saving}>
                     {saving ? 'Moving…' : 'Move'}
                  </Button>
               </DialogFooter>
            )}
         </DialogContent>
      </Dialog>
   );
}
