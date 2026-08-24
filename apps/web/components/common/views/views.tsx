'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLiveTeam } from '@/components/common/teams/use-live-team';
import { useViewsDisplayStore, ViewsOrdering } from '@/store/views-display-store';
import { ArrowDown, FolderKanban, ListTodo, Plus, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { LiveView, useLiveViews } from './use-live-views';

const TABS = ['issues', 'projects'] as const;
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const formatDate = (value: string) =>
   new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(value)
   );

function DisplayOptions() {
   const { ordering, displayProperties, setOrdering, toggleProperty } = useViewsDisplayStore();
   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button size="xs" variant="ghost">
               <SlidersHorizontal className="size-4" />
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-72 p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
               <span className="text-xs text-muted-foreground">Ordering</span>
               <Select
                  value={ordering}
                  onValueChange={(value) => setOrdering(value as ViewsOrdering)}
               >
                  <SelectTrigger className="w-32 h-7 text-xs">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="name">Name</SelectItem>
                     <SelectItem value="created">Created</SelectItem>
                     <SelectItem value="updated">Updated</SelectItem>
                  </SelectContent>
               </Select>
            </div>
            <div className="flex flex-wrap gap-1.5">
               {(
                  [
                     ['created', 'Created'],
                     ['updated', 'Updated'],
                     ['owner', 'Owner'],
                  ] as const
               ).map(([key, label]) => (
                  <button
                     key={key}
                     onClick={() => toggleProperty(key)}
                     className={cn(
                        'px-2 py-0.5 rounded-md border text-xs transition-colors',
                        displayProperties[key]
                           ? 'bg-accent border-transparent'
                           : 'text-muted-foreground hover:bg-accent/50'
                     )}
                  >
                     {label}
                  </button>
               ))}
            </div>
         </PopoverContent>
      </Popover>
   );
}

function ViewRow({ view, orgId }: { view: LiveView; orgId: string }) {
   const { displayProperties } = useViewsDisplayStore();
   const isIssue = view.entityType === 'issue';
   return (
      <Link
         href={`/${orgId}/view/${view.id}`}
         className="flex items-center gap-3 px-6 py-2.5 border-b border-border/50 hover:bg-sidebar/50 transition-colors"
      >
         <span className="inline-flex size-6 items-center justify-center rounded bg-muted/50 text-sm shrink-0">
            {isIssue ? <ListTodo className="size-4" /> : <FolderKanban className="size-4" />}
         </span>
         <span className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium truncate">{view.name}</span>
            <span className="text-xs text-muted-foreground truncate">
               {view.isShared ? 'Shared workspace view' : 'Private saved view'}
            </span>
         </span>
         {displayProperties.created && (
            <span className="hidden sm:block text-xs text-muted-foreground w-24 shrink-0">
               {formatDate(view.createdAt)}
            </span>
         )}
         {displayProperties.updated && (
            <span className="hidden sm:block text-xs text-muted-foreground w-24 shrink-0">
               {formatDate(view.updatedAt)}
            </span>
         )}
         {displayProperties.owner && (
            <span className="flex items-center gap-1.5 w-32 shrink-0 justify-end">
               <Avatar className="size-5">
                  <AvatarFallback className="text-[9px]">{view.createdBy.name[0]}</AvatarFallback>
               </Avatar>
               <span className="text-xs text-muted-foreground truncate max-w-24">
                  {view.createdBy.name}
               </span>
            </span>
         )}
      </Link>
   );
}

export default function Views({ teamId }: { teamId?: string }) {
   const { orgId } = useParams<{ orgId: string }>();
   const [tab, setTab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('issues'));
   const { ordering } = useViewsDisplayStore();
   const { workspaceId, views, loading, error, reload } = useLiveViews();
   const { team } = useLiveTeam(teamId ?? '');
   const [open, setOpen] = useState(false);
   const [name, setName] = useState('');
   const [submitting, setSubmitting] = useState(false);
   const [formError, setFormError] = useState<string>();
   useEffect(() => {
      const openCreateDialog = () => setOpen(true);
      window.addEventListener('flowie:create-view', openCreateDialog);
      return () => window.removeEventListener('flowie:create-view', openCreateDialog);
   }, []);
   const list = useMemo(
      () =>
         views
            .filter((view) =>
               tab === 'issues' ? view.entityType === 'issue' : view.entityType === 'project'
            )
            .filter((view) => !teamId || view.filters.teamId === team?.id)
            .sort((a, b) =>
               ordering === 'created'
                  ? b.createdAt.localeCompare(a.createdAt)
                  : ordering === 'updated'
                    ? b.updatedAt.localeCompare(a.updatedAt)
                    : a.name.localeCompare(b.name)
            ),
      [ordering, tab, team?.id, teamId, views]
   );
   const create = async () => {
      if (!workspaceId || name.trim().length < 2) {
         setFormError('View name must contain at least 2 characters.');
         return;
      }
      setSubmitting(true);
      setFormError(undefined);
      try {
         const response = await fetch(`${api}/views`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId,
               name: name.trim(),
               entityType: tab === 'issues' ? 'issue' : 'project',
               filters: team ? { teamId: team.id } : {},
               isShared: true,
            }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not create view.');
         }
         setOpen(false);
         setName('');
         reload();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not create view.');
      } finally {
         setSubmitting(false);
      }
   };
   if (loading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading views…</div>;
   if (error) return <div className="px-8 py-10 text-sm text-destructive">{error}</div>;
   return (
      <div className="w-full h-full overflow-y-auto">
         <div className="flex items-center justify-between px-6 pt-3 pb-2">
            <div className="flex items-center gap-1.5">
               {TABS.map((candidate) => (
                  <button
                     key={candidate}
                     onClick={() => setTab(candidate)}
                     className={cn(
                        'px-2.5 py-1 rounded-md border text-xs font-medium capitalize transition-colors',
                        tab === candidate
                           ? 'bg-accent border-transparent'
                           : 'text-muted-foreground hover:bg-accent/50'
                     )}
                  >
                     {candidate}
                  </button>
               ))}
            </div>
            <DisplayOptions />
         </div>
         <div className="flex items-center gap-1 px-6 py-1.5 text-xs text-muted-foreground border-b">
            Name <ArrowDown className="size-3" />
         </div>
         <div className="flex items-center justify-between px-6 py-2 bg-sidebar/60 border-b border-border/50">
            <span className="flex items-center gap-2 text-sm">
               <span className="inline-flex size-5 items-center justify-center rounded bg-muted/50 text-xs">
                  {team?.icon ?? '◌'}
               </span>
               <span className="font-medium">{team?.name ?? 'Workspace'}</span>
               <span className="text-muted-foreground text-xs">
                  · {team ? 'Team' : 'Workspace'}
               </span>
            </span>
            <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
               <Plus className="size-3.5" />
            </Button>
         </div>
         {list.map((view) => (
            <ViewRow key={view.id} view={view} orgId={orgId} />
         ))}
         {list.length === 0 && (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
               No views yet
            </div>
         )}
         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>New saved view</DialogTitle>
                  <DialogDescription>
                     Create a {tab === 'issues' ? 'issue' : 'project'} view in{' '}
                     {team?.name ?? 'this workspace'}.
                  </DialogDescription>
               </DialogHeader>
               <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="View name"
                  autoFocus
               />
               {formError && <p className="text-sm text-destructive">{formError}</p>}
               <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                     Cancel
                  </Button>
                  <Button onClick={() => void create()} disabled={submitting}>
                     {submitting ? 'Creating…' : 'Create view'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
