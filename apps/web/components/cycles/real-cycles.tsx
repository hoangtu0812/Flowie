'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { ChevronDown, CirclePlay } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useState } from 'react';

type Cycle = {
   id: string;
   name: string;
   description: string | null;
   status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'CANCELED';
   startDate: string | null;
   endDate: string | null;
   _count: { issueLinks: number };
};
type CycleIssue = {
   id: string;
   identifier: string;
   title: string;
   status: { name: string; color: string };
   assignee: { name: string } | null;
};
type WorkspaceResponse = { data: Array<{ workspace: { id: string } }> };

const STATUS_LABEL: Record<Cycle['status'], string> = {
   UPCOMING: 'Upcoming',
   ACTIVE: 'Current',
   COMPLETED: 'Completed',
   CANCELED: 'Canceled',
};
const formatDate = (value: string | null) =>
   value
      ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
           new Date(value)
        )
      : '—';

export function RealCycles({ teamId, status }: { teamId: string; status?: Cycle['status'] }) {
   const { orgId } = useParams<{ orgId: string }>();
   const [cycles, setCycles] = useState<Cycle[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [createOpen, setCreateOpen] = useState(false);
   const [name, setName] = useState('');
   const [createError, setCreateError] = useState<string>();
   const [saving, setSaving] = useState(false);
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

   const loadCycles = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspaceData = (await workspaceResponse.json()) as WorkspaceResponse;
      const currentWorkspaceId = workspaceData.data[0]?.workspace.id;
      if (!currentWorkspaceId) throw new Error('No workspace is available.');
      setWorkspaceId(currentWorkspaceId);
      const query = new URLSearchParams({ workspaceId: currentWorkspaceId, teamId });
      if (status) query.set('status', status);
      const response = await fetch(`${api}/cycles?${query.toString()}`, { credentials: 'include' });
      if (!response.ok) throw new Error('Could not load cycles.');
      setCycles(((await response.json()) as { data: Cycle[] }).data);
   }, [api, status, teamId]);

   useEffect(() => {
      void loadCycles()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [loadCycles]);

   useEffect(() => {
      const open = () => setCreateOpen(true);
      window.addEventListener('flowie:create-cycle', open);
      return () => window.removeEventListener('flowie:create-cycle', open);
   }, []);

   async function createCycle(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!workspaceId || name.trim().length < 2) return;
      setSaving(true);
      setCreateError(undefined);
      try {
         const response = await fetch(`${api}/cycles`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, teamId, name: name.trim(), status: 'UPCOMING' }),
         });
         if (!response.ok) throw new Error('Could not create the cycle.');
         setName('');
         setCreateOpen(false);
         await loadCycles();
      } catch (caught) {
         setCreateError(caught instanceof Error ? caught.message : 'Could not create the cycle.');
      } finally {
         setSaving(false);
      }
   }

   return (
      <div className="w-full py-4">
         {state === 'loading' && (
            <p className="px-6 py-4 text-sm text-muted-foreground">Loading cycles…</p>
         )}
         {state === 'error' && (
            <p className="px-6 py-4 text-sm text-destructive">
               Could not load cycles for this team.
            </p>
         )}
         {state === 'ready' && cycles.length === 0 && (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
               No cycles in this view yet.
            </div>
         )}
         {cycles.map((cycle) => (
            <CycleRow
               key={cycle.id}
               cycle={cycle}
               teamId={teamId}
               workspaceId={workspaceId}
               api={api}
               orgId={orgId}
            />
         ))}
         <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="sm:max-w-[480px]">
               <DialogHeader>
                  <DialogTitle>Create cycle</DialogTitle>
               </DialogHeader>
               <form className="space-y-4" onSubmit={createCycle}>
                  <Input
                     autoFocus
                     value={name}
                     onChange={(event) => setName(event.target.value)}
                     placeholder="Cycle name"
                     minLength={2}
                     maxLength={120}
                     required
                  />
                  {createError && <p className="text-sm text-destructive">{createError}</p>}
                  <div className="flex justify-end gap-2">
                     <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                        Cancel
                     </Button>
                     <Button type="submit" disabled={saving || name.trim().length < 2}>
                        {saving ? 'Creating…' : 'Create cycle'}
                     </Button>
                  </div>
               </form>
            </DialogContent>
         </Dialog>
      </div>
   );
}

function CycleRow({
   cycle,
   teamId,
   workspaceId,
   api,
   orgId,
}: {
   cycle: Cycle;
   teamId: string;
   workspaceId?: string;
   api: string;
   orgId: string;
}) {
   const [expanded, setExpanded] = useState(false);
   const [issues, setIssues] = useState<CycleIssue[]>([]);
   const [loading, setLoading] = useState(false);
   const href =
      cycle.status === 'ACTIVE'
         ? `/${orgId}/team/${teamId}/cycle/active`
         : cycle.status === 'UPCOMING'
           ? `/${orgId}/team/${teamId}/cycle/upcoming`
           : undefined;

   async function toggleIssues() {
      const next = !expanded;
      setExpanded(next);
      if (!next || issues.length || !workspaceId) return;
      setLoading(true);
      try {
         const response = await fetch(
            `${api}/cycles/${cycle.id}/issues?workspaceId=${workspaceId}`,
            { credentials: 'include' }
         );
         if (response.ok) setIssues(((await response.json()) as { data: CycleIssue[] }).data);
      } finally {
         setLoading(false);
      }
   }

   const title = (
      <div className="flex items-center gap-3 min-w-0">
         <CirclePlay className="size-4 shrink-0 text-muted-foreground" />
         <span className="text-sm font-medium truncate">{cycle.name}</span>
      </div>
   );
   return (
      <div className="w-full flex items-stretch">
         <div className="relative w-14 shrink-0 flex flex-col items-end pr-4 sm:w-20">
            <div className="absolute right-[20.5px] top-0 bottom-0 w-px bg-border" />
            <div className="flex h-12 items-center gap-2">
               <span className="text-right text-[11px] leading-tight text-muted-foreground">
                  {formatDate(cycle.startDate)}
               </span>
               <span
                  className={cn(
                     'relative z-10 size-2.5 rounded-full border-2 bg-background',
                     cycle.status === 'ACTIVE'
                        ? 'border-indigo-400 bg-indigo-400'
                        : 'border-muted-foreground/40'
                  )}
               />
            </div>
         </div>
         <div className="flex-1 min-w-0 border-b border-border/60">
            <div className="flex h-12 items-center justify-between gap-4 rounded-md px-6 hover:bg-sidebar/50">
               {href ? (
                  <Link href={href} className="min-w-0">
                     {title}
                  </Link>
               ) : (
                  title
               )}
               <div className="flex shrink-0 items-center gap-3 sm:gap-6">
                  <span className="rounded-md bg-accent px-2 py-1 text-xs text-muted-foreground">
                     {STATUS_LABEL[cycle.status]}
                  </span>
                  <span className="hidden text-sm text-muted-foreground sm:inline">
                     {cycle._count.issueLinks} issues
                  </span>
                  <Button
                     type="button"
                     className="size-7"
                     size="icon"
                     variant="ghost"
                     onClick={() => void toggleIssues()}
                     aria-label="Show cycle issues"
                  >
                     <ChevronDown
                        className={cn('size-4 transition-transform', expanded && 'rotate-180')}
                     />
                  </Button>
               </div>
            </div>
            {expanded && (
               <div className="px-6 pb-4 pt-1">
                  {loading ? (
                     <p className="text-xs text-muted-foreground">Loading cycle issues…</p>
                  ) : issues.length ? (
                     <div className="space-y-1">
                        {issues.map((issue) => (
                           <div key={issue.id} className="flex items-center gap-2 py-1 text-sm">
                              <span
                                 className="size-2 rounded-full"
                                 style={{ backgroundColor: issue.status.color }}
                              />
                              <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                              <span className="text-xs text-muted-foreground">
                                 {issue.identifier}
                              </span>
                           </div>
                        ))}
                     </div>
                  ) : (
                     <p className="text-xs text-muted-foreground">
                        No issues assigned to this cycle.
                     </p>
                  )}
               </div>
            )}
         </div>
      </div>
   );
}
