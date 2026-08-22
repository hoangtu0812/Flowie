'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CircleDot, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

type Issue = {
   id: string;
   identifier: string;
   title: string;
   priority: string;
   createdAt: string;
   status: { id: string; name: string; category: string; color: string };
   project: { id: string; name: string; identifier: string } | null;
   assignee: { id: string; name: string; avatarUrl: string | null } | null;
};
type WorkspaceResponse = { data: Array<{ workspace: { id: string } }> };

const PRIORITY_ORDER: Record<string, number> = {
   URGENT: 0,
   HIGH: 1,
   MEDIUM: 2,
   LOW: 3,
   NONE: 4,
};

export function RealIssues({ teamId, categories }: { teamId: string; categories?: string[] }) {
   const { orgId } = useParams<{ orgId: string }>();
   const searchParams = useSearchParams();
   const queryText = searchParams.get('q')?.trim().toLowerCase() ?? '';
   const [issues, setIssues] = useState<Issue[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [filterOpen, setFilterOpen] = useState(false);
   const [priorityFilter, setPriorityFilter] = useState('ALL');
   const [createOpen, setCreateOpen] = useState(false);
   const [title, setTitle] = useState('');
   const [createError, setCreateError] = useState<string>();
   const [saving, setSaving] = useState(false);
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

   const loadIssues = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspaceData = (await workspaceResponse.json()) as WorkspaceResponse;
      const currentWorkspaceId = workspaceData.data[0]?.workspace.id;
      if (!currentWorkspaceId) throw new Error('No workspace is available.');
      setWorkspaceId(currentWorkspaceId);
      const query = new URLSearchParams({ workspaceId: currentWorkspaceId, teamId });
      if (categories?.length) query.set('categories', categories.join(','));
      const issueResponse = await fetch(`${api}/issues?${query.toString()}`, {
         credentials: 'include',
      });
      if (!issueResponse.ok) throw new Error('Could not load issues.');
      setIssues(((await issueResponse.json()) as { data: Issue[] }).data);
   }, [api, categories, teamId]);

   useEffect(() => {
      void loadIssues()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [loadIssues]);

   useEffect(() => {
      const toggle = () => setFilterOpen((open) => !open);
      window.addEventListener('flowie:toggle-issue-filter', toggle);
      return () => window.removeEventListener('flowie:toggle-issue-filter', toggle);
   }, []);

   const displayed = useMemo(
      () =>
         issues
            .filter((issue) =>
               !queryText
                  ? true
                  : `${issue.identifier} ${issue.title} ${issue.project?.name ?? ''}`
                       .toLowerCase()
                       .includes(queryText)
            )
            .filter((issue) => priorityFilter === 'ALL' || issue.priority === priorityFilter)
            .sort(
               (left, right) =>
                  (PRIORITY_ORDER[left.priority] ?? 99) - (PRIORITY_ORDER[right.priority] ?? 99)
            ),
      [issues, priorityFilter, queryText]
   );

   const groups = useMemo(() => {
      const byStatus = new Map<string, { status: Issue['status']; issues: Issue[] }>();
      for (const issue of displayed) {
         const existing = byStatus.get(issue.status.id);
         if (existing) existing.issues.push(issue);
         else byStatus.set(issue.status.id, { status: issue.status, issues: [issue] });
      }
      return [...byStatus.values()].sort((left, right) =>
         left.status.name.localeCompare(right.status.name)
      );
   }, [displayed]);

   async function createIssue(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!workspaceId || title.trim().length < 2) return;
      setSaving(true);
      setCreateError(undefined);
      try {
         const response = await fetch(`${api}/issues`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, teamId, title: title.trim() }),
         });
         if (!response.ok) throw new Error('Could not create the issue.');
         setTitle('');
         setCreateOpen(false);
         await loadIssues();
      } catch (caught) {
         setCreateError(caught instanceof Error ? caught.message : 'Could not create the issue.');
      } finally {
         setSaving(false);
      }
   }

   if (state === 'error') {
      return (
         <div className="space-y-3 p-6 text-sm">
            <p className="text-destructive">Could not load issues for this team.</p>
            <Link className="font-medium text-primary underline" href={`/${orgId}/teams`}>
               Back to teams
            </Link>
         </div>
      );
   }

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         {filterOpen && (
            <div className="flex items-center gap-1 border-b bg-container px-6 py-2">
               {['ALL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'].map((priority) => (
                  <Button
                     key={priority}
                     size="xs"
                     variant={priorityFilter === priority ? 'secondary' : 'ghost'}
                     onClick={() => setPriorityFilter(priority)}
                  >
                     {priority === 'ALL' ? 'All priorities' : priority.toLowerCase()}
                  </Button>
               ))}
            </div>
         )}
         <div className="flex-1 min-h-0 overflow-y-auto">
            {state === 'loading' && (
               <p className="px-6 py-4 text-sm text-muted-foreground">Loading issues…</p>
            )}
            {state === 'ready' && groups.length === 0 && (
               <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  No issues to show.
               </div>
            )}
            {groups.map((group) => (
               <section key={group.status.id}>
                  <div className="sticky top-0 z-10 h-10 bg-container">
                     <div
                        className="flex h-full w-full items-center justify-between px-6"
                        style={{ backgroundColor: `${group.status.color}08` }}
                     >
                        <div className="flex items-center gap-2">
                           <CircleDot className="size-4" style={{ color: group.status.color }} />
                           <span className="text-sm font-medium">{group.status.name}</span>
                           <span className="text-sm text-muted-foreground">
                              {group.issues.length}
                           </span>
                        </div>
                        <Button
                           className="size-6"
                           size="icon"
                           variant="ghost"
                           onClick={() => setCreateOpen(true)}
                           aria-label={`Create issue in ${group.status.name}`}
                        >
                           <Plus className="size-4" />
                        </Button>
                     </div>
                  </div>
                  {group.issues.map((issue) => (
                     <Link
                        key={issue.id}
                        href={`/${orgId}/issue/${issue.id}`}
                        className="flex h-11 w-full items-center justify-start px-6 hover:bg-sidebar/50"
                     >
                        <span className="hidden w-[66px] shrink-0 truncate text-sm font-medium text-muted-foreground sm:inline-block">
                           {issue.identifier}
                        </span>
                        <CircleDot
                           className="size-4 shrink-0"
                           style={{ color: issue.status.color }}
                        />
                        <span className="ml-2 min-w-0 truncate text-xs font-medium sm:text-sm sm:font-semibold">
                           {issue.title}
                        </span>
                        <div className="ml-auto flex items-center justify-end gap-2">
                           {issue.project && (
                              <span className="hidden rounded-md border border-border px-1.5 py-0.5 text-xs text-muted-foreground lg:inline-block">
                                 {issue.project.name}
                              </span>
                           )}
                           {issue.priority !== 'NONE' && (
                              <span
                                 className={cn(
                                    'hidden text-xs capitalize text-muted-foreground sm:inline-block',
                                    issue.priority === 'URGENT' && 'text-red-500'
                                 )}
                              >
                                 {issue.priority.toLowerCase()}
                              </span>
                           )}
                           {issue.assignee && (
                              <Avatar className="size-5">
                                 <AvatarImage
                                    src={issue.assignee.avatarUrl ?? undefined}
                                    alt={issue.assignee.name}
                                 />
                                 <AvatarFallback>{issue.assignee.name.charAt(0)}</AvatarFallback>
                              </Avatar>
                           )}
                        </div>
                     </Link>
                  ))}
               </section>
            ))}
         </div>
         <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="sm:max-w-[560px]">
               <DialogHeader>
                  <DialogTitle>Create issue</DialogTitle>
               </DialogHeader>
               <form className="space-y-4" onSubmit={createIssue}>
                  <Input
                     autoFocus
                     value={title}
                     onChange={(event) => setTitle(event.target.value)}
                     placeholder="What needs to be done?"
                     minLength={2}
                     maxLength={500}
                     required
                  />
                  {createError && <p className="text-sm text-destructive">{createError}</p>}
                  <div className="flex justify-end gap-2">
                     <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                        Cancel
                     </Button>
                     <Button type="submit" disabled={saving || title.trim().length < 2}>
                        {saving ? 'Creating…' : 'Create issue'}
                     </Button>
                  </div>
               </form>
            </DialogContent>
         </Dialog>
      </div>
   );
}
