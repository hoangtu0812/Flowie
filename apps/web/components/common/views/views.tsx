'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingState } from '@/components/common/loading-state';
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
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { authenticatedFetch } from '@/lib/workspaces';
import { useViewsDisplayStore, ViewsOrdering } from '@/store/views-display-store';
import { ArrowDown, Box, Layers, Plus, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { FormEvent, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LiveView, useLiveViews } from './use-live-views';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const TABS = ['issues', 'projects'] as const;

const formatDate = (iso: string): string => {
   const date = new Date(iso);
   return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

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
               <select
                  value={ordering}
                  onChange={(event) => setOrdering(event.target.value as ViewsOrdering)}
                  className="h-7 rounded-md border bg-transparent px-2 text-xs"
               >
                  <option value="name">Name</option>
                  <option value="created">Created</option>
                  <option value="updated">Updated</option>
               </select>
            </div>
            <div className="flex flex-col gap-2">
               <span className="text-xs text-muted-foreground">Display properties</span>
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
            </div>
         </PopoverContent>
      </Popover>
   );
}

function ViewRow({ view, orgId }: { view: LiveView; orgId: string }) {
   const { displayProperties } = useViewsDisplayStore();
   const Icon = view.entityType === 'issue' ? Layers : Box;
   return (
      <Link
         href={`/${orgId}/view/${view.id}`}
         className="flex items-center gap-3 px-6 py-2.5 border-b border-border/50 hover:bg-sidebar/50 transition-colors"
      >
         <span className="inline-flex size-6 items-center justify-center rounded bg-muted/50 text-sm shrink-0">
            <Icon className="size-3.5" />
         </span>
         <span className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium truncate">{view.name}</span>
            <span className="text-xs text-muted-foreground truncate">
               {view.description ?? 'No description'}
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
                  <AvatarImage src={view.createdBy.avatarUrl ?? ''} alt={view.createdBy.name} />
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

function CreateViewDialog({
   open,
   onOpenChange,
   workspaceId,
   defaultType,
   onCreated,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   workspaceId?: string;
   defaultType: 'issue' | 'project';
   onCreated: () => void;
}) {
   const [name, setName] = useState('');
   const [description, setDescription] = useState('');
   const [shared, setShared] = useState(false);
   const [submitting, setSubmitting] = useState(false);
   const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !name.trim()) return;
      setSubmitting(true);
      try {
         const response = await authenticatedFetch(`${api}/views`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId,
               name,
               description,
               entityType: defaultType,
               isShared: shared,
            }),
         });
         if (!response.ok)
            throw new Error(
               ((await response.json().catch(() => null)) as { message?: string } | null)
                  ?.message ?? 'Could not create view.'
            );
         setName('');
         setDescription('');
         setShared(false);
         onOpenChange(false);
         onCreated();
         toast.success('View created.');
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not create view.');
      } finally {
         setSubmitting(false);
      }
   };
   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-md">
            <DialogHeader>
               <DialogTitle>Create view</DialogTitle>
               <DialogDescription>
                  Save a reusable {defaultType} view for this workspace.
               </DialogDescription>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={submit}>
               <label className="grid gap-1.5 text-sm font-medium">
                  Name
                  <Input
                     autoFocus
                     value={name}
                     onChange={(event) => setName(event.target.value)}
                     required
                     maxLength={120}
                  />
               </label>
               <label className="grid gap-1.5 text-sm font-medium">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                  <textarea
                     className="border-input min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                     value={description}
                     onChange={(event) => setDescription(event.target.value)}
                     maxLength={500}
                  />
               </label>
               <label className="flex items-center justify-between text-sm">
                  Share with workspace
                  <Switch checked={shared} onCheckedChange={setShared} />
               </label>
               <DialogFooter>
                  <Button
                     type="button"
                     variant="ghost"
                     onClick={() => onOpenChange(false)}
                     disabled={submitting}
                  >
                     Cancel
                  </Button>
                  <Button type="submit" disabled={submitting || !workspaceId || !name.trim()}>
                     {submitting ? 'Creating…' : 'Create view'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}

/** Workspace saved views; Circle layout is retained while records are FastAPI/PostgreSQL-backed. */
export default function Views({ teamId }: { teamId?: string }) {
   const { orgId } = useParams<{ orgId: string }>();
   const [tab, setTab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('issues'));
   const { ordering } = useViewsDisplayStore();
   const { workspaceId, views, loading, error, reload } = useLiveViews();
   const [createOpen, setCreateOpen] = useState(false);
   // Saved views are workspace-owned in the existing schema. Keep the team route
   // and Circle layout, but do not fabricate a team filter that cannot persist.
   void teamId;
   const list = useMemo(
      () =>
         views
            .filter((view) => view.entityType === (tab === 'issues' ? 'issue' : 'project'))
            .sort((a, b) =>
               ordering === 'created'
                  ? b.createdAt.localeCompare(a.createdAt)
                  : ordering === 'updated'
                    ? b.updatedAt.localeCompare(a.updatedAt)
                    : a.name.localeCompare(b.name)
            ),
      [views, tab, ordering]
   );
   const entityType = tab === 'issues' ? 'issue' : 'project';
   return (
      <div className="w-full h-full overflow-y-auto">
         <div className="flex items-center justify-between px-6 pt-3 pb-2">
            <div className="flex items-center gap-1.5">
               {TABS.map((candidate) => (
                  <button
                     key={candidate}
                     onClick={() => void setTab(candidate)}
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
            Name
            <ArrowDown className="size-3" />
         </div>
         <div className="flex items-center justify-between px-6 py-2 bg-sidebar/60 border-b border-border/50">
            <span className="flex items-center gap-2 text-sm">
               <span className="inline-flex size-5 items-center justify-center rounded bg-primary text-primary-foreground text-[10px] font-semibold">
                  F
               </span>
               <span className="font-medium">Workspace</span>
               <span className="text-muted-foreground text-xs">· Saved views</span>
            </span>
            <Button size="xs" variant="ghost" onClick={() => setCreateOpen(true)}>
               <Plus className="size-3.5" />
            </Button>
         </div>
         {loading && <LoadingState label="Loading views…" className="min-h-48" />}
         {error && <div className="py-12 text-center text-sm text-destructive">{error}</div>}
         {!loading &&
            !error &&
            list.map((view) => <ViewRow key={view.id} view={view} orgId={orgId} />)}
         {!loading && !error && list.length === 0 && (
            <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
               No views yet
            </div>
         )}
         <CreateViewDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
            workspaceId={workspaceId}
            defaultType={entityType}
            onCreated={reload}
         />
      </div>
   );
}
