'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { CircleDot } from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Scope = 'assigned' | 'created';
type Issue = {
   id: string;
   identifier: string;
   title: string;
   priority: string;
   createdAt: string;
   status: { id: string; name: string; color: string };
   team: { name: string };
   assignee: { name: string; avatarUrl: string | null } | null;
};
type WorkspaceResponse = { data: Array<{ workspace: { id: string } }> };
const PRIORITIES = ['ALL', 'URGENT', 'HIGH', 'MEDIUM', 'LOW', 'NONE'];

export function RealMyIssues() {
   const searchParams = useSearchParams();
   const { orgId } = useParams<{ orgId: string }>();
   const scope: Scope = searchParams.get('scope') === 'created' ? 'created' : 'assigned';
   const queryText = searchParams.get('q')?.trim().toLowerCase() ?? '';
   const [issues, setIssues] = useState<Issue[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [filterOpen, setFilterOpen] = useState(false);
   const [priority, setPriority] = useState('ALL');
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   const load = useCallback(async () => {
      const workspaceResponse = await fetch(`${api}/workspaces/me`, { credentials: 'include' });
      if (!workspaceResponse.ok) throw new Error('Could not load workspace.');
      const workspaces = (await workspaceResponse.json()) as WorkspaceResponse;
      const workspaceId = workspaces.data[0]?.workspace.id;
      if (!workspaceId) throw new Error('No workspace is available.');
      const response = await fetch(`${api}/issues?${new URLSearchParams({ workspaceId, scope })}`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not load issues.');
      setIssues(((await response.json()) as { data: Issue[] }).data);
   }, [api, scope]);
   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);
   useEffect(() => {
      const toggle = () => setFilterOpen((open) => !open);
      window.addEventListener('flowie:toggle-my-issues-filter', toggle);
      return () => window.removeEventListener('flowie:toggle-my-issues-filter', toggle);
   }, []);
   const displayed = useMemo(
      () =>
         issues
            .filter(
               (issue) =>
                  !queryText ||
                  `${issue.identifier} ${issue.title} ${issue.team.name}`
                     .toLowerCase()
                     .includes(queryText)
            )
            .filter((issue) => priority === 'ALL' || issue.priority === priority),
      [issues, priority, queryText]
   );
   const groups = useMemo(() => {
      const values = new Map<string, { status: Issue['status']; issues: Issue[] }>();
      for (const issue of displayed) {
         const existing = values.get(issue.status.id);
         if (existing) existing.issues.push(issue);
         else values.set(issue.status.id, { status: issue.status, issues: [issue] });
      }
      return [...values.values()].sort((left, right) =>
         left.status.name.localeCompare(right.status.name)
      );
   }, [displayed]);
   return (
      <div className="flex h-full w-full flex-col overflow-hidden">
         {filterOpen && (
            <div className="flex items-center gap-1 border-b bg-container px-6 py-2">
               {PRIORITIES.map((value) => (
                  <Button
                     key={value}
                     size="xs"
                     variant={priority === value ? 'secondary' : 'ghost'}
                     onClick={() => setPriority(value)}
                  >
                     {value === 'ALL' ? 'All priorities' : value.toLowerCase()}
                  </Button>
               ))}
            </div>
         )}
         <div className="min-h-0 flex-1 overflow-y-auto">
            {state === 'loading' && (
               <p className="p-6 text-sm text-muted-foreground">Loading issues…</p>
            )}
            {state === 'error' && (
               <p className="p-6 text-sm text-destructive">Could not load your issues.</p>
            )}
            {state === 'ready' && groups.length === 0 && (
               <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
                  No {scope} issues in this view.
               </div>
            )}
            {groups.map((group) => (
               <section key={group.status.id}>
                  <div
                     className="sticky top-0 z-10 flex h-10 items-center gap-2 bg-container px-6"
                     style={{ backgroundColor: `${group.status.color}08` }}
                  >
                     <CircleDot className="size-4" style={{ color: group.status.color }} />
                     <span className="text-sm font-medium">{group.status.name}</span>
                     <span className="text-sm text-muted-foreground">{group.issues.length}</span>
                  </div>
                  {group.issues.map((issue) => (
                     <Link
                        key={issue.id}
                        href={`/${orgId}/issue/${issue.id}`}
                        className="flex h-11 items-center gap-2 px-6 hover:bg-sidebar/50"
                     >
                        <span className="hidden w-[66px] shrink-0 truncate text-sm font-medium text-muted-foreground sm:inline-block">
                           {issue.identifier}
                        </span>
                        <CircleDot
                           className="size-4 shrink-0"
                           style={{ color: issue.status.color }}
                        />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">
                           {issue.title}
                        </span>
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                           {issue.team.name}
                        </span>
                        {issue.assignee && (
                           <Avatar className="size-5">
                              <AvatarImage
                                 src={issue.assignee.avatarUrl ?? undefined}
                                 alt={issue.assignee.name}
                              />
                              <AvatarFallback>{issue.assignee.name.charAt(0)}</AvatarFallback>
                           </Avatar>
                        )}
                     </Link>
                  ))}
               </section>
            ))}
         </div>
      </div>
   );
}
