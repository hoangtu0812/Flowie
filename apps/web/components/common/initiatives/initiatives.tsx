'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Calendar, FolderKanban, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { LiveInitiative, useLiveInitiatives } from './use-live-initiatives';

const TABS = ['active', 'planned', 'all'] as const;
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const dateLabel = (value: string | null) =>
   value
      ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
      : 'No target date';
const statusLabel = (value: string) => value.replaceAll('-', ' ');

function InitiativeRow({ initiative, orgId }: { initiative: LiveInitiative; orgId: string }) {
   const projects = initiative.projectLinks.map((link) => link.project);
   const completed = projects.filter(
      (project) => project.status.toLowerCase() === 'completed'
   ).length;
   return (
      <Link
         href={`/${orgId}/initiative/${initiative.id}`}
         className="flex items-center gap-3 px-6 py-3 border-b border-border/50 hover:bg-sidebar/50 transition-colors"
      >
         <span className="inline-flex size-7 items-center justify-center rounded bg-muted/50 text-sm shrink-0">
            {initiative.icon ?? '🎯'}
         </span>
         <span className="flex flex-col min-w-0 flex-1">
            <span className="text-sm font-medium truncate">{initiative.name}</span>
            <span className="text-xs text-muted-foreground truncate">
               {initiative.description || 'No description'}
            </span>
         </span>
         <span className="hidden md:inline-flex capitalize text-xs px-2 py-1 rounded-md bg-accent text-muted-foreground w-24 justify-center">
            {statusLabel(initiative.status)}
         </span>
         <span className="hidden lg:flex items-center gap-1.5 w-28 shrink-0 text-xs text-muted-foreground">
            <Calendar className="size-3.5" />
            {dateLabel(initiative.targetDate)}
         </span>
         <span className="hidden md:flex items-center gap-1.5 w-24 shrink-0 text-xs text-muted-foreground">
            <FolderKanban className="size-3.5" />
            {completed}/{projects.length}
         </span>
         <span className="hidden sm:flex items-center gap-1.5 w-28 shrink-0 justify-end">
            <Avatar className="size-5">
               <AvatarImage
                  src={initiative.owner?.avatarUrl ?? undefined}
                  alt={initiative.owner?.name ?? 'Owner'}
               />
               <AvatarFallback className="text-[9px]">
                  {initiative.owner?.name?.[0] ?? '—'}
               </AvatarFallback>
            </Avatar>
            <span className="text-xs text-muted-foreground truncate max-w-20">
               {initiative.owner?.name ?? 'Unassigned'}
            </span>
         </span>
      </Link>
   );
}

export default function Initiatives() {
   const { orgId } = useParams<{ orgId: string }>();
   const [tab, setTab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('active'));
   const { workspaceId, initiatives, loading, error, reload } = useLiveInitiatives();
   const [open, setOpen] = useState(false);
   const [name, setName] = useState('');
   const [description, setDescription] = useState('');
   const [targetDate, setTargetDate] = useState('');
   const [submitting, setSubmitting] = useState(false);
   const [formError, setFormError] = useState<string>();
   const visible = useMemo(
      () =>
         initiatives.filter((initiative) =>
            tab === 'all'
               ? true
               : tab === 'planned'
                 ? initiative.status.toLowerCase() === 'planned'
                 : !['planned', 'completed', 'canceled'].includes(initiative.status.toLowerCase())
         ),
      [initiatives, tab]
   );
   const create = async () => {
      if (!workspaceId || name.trim().length < 2) {
         setFormError('Initiative name must contain at least 2 characters.');
         return;
      }
      setSubmitting(true);
      setFormError(undefined);
      try {
         const response = await fetch(`${api}/initiatives`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId,
               name: name.trim(),
               description: description.trim() || undefined,
               targetDate: targetDate || undefined,
            }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not create initiative.');
         }
         setOpen(false);
         setName('');
         setDescription('');
         setTargetDate('');
         reload();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not create initiative.');
      } finally {
         setSubmitting(false);
      }
   };
   if (loading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading initiatives…</div>;
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
                     {candidate === 'all' ? 'All initiatives' : candidate}
                  </button>
               ))}
            </div>
            <Button size="xs" variant="secondary" onClick={() => setOpen(true)}>
               <Plus className="size-4 mr-1" />
               New initiative
            </Button>
         </div>
         <div className="grid grid-cols-[1fr_100px_120px_100px_120px] gap-3 px-6 py-1.5 text-xs text-muted-foreground border-b">
            <span>Name</span>
            <span className="hidden md:block">Status</span>
            <span className="hidden lg:block">Target</span>
            <span className="hidden md:block">Projects</span>
            <span className="hidden sm:block text-right">Owner</span>
         </div>
         {visible.map((initiative) => (
            <InitiativeRow key={initiative.id} initiative={initiative} orgId={orgId} />
         ))}
         {visible.length === 0 && (
            <div className="py-16 text-center text-sm text-muted-foreground">
               No initiatives yet.
            </div>
         )}
         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>New initiative</DialogTitle>
                  <DialogDescription>
                     Create a strategic initiative for your workspace.
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <Input
                     value={name}
                     onChange={(event) => setName(event.target.value)}
                     placeholder="Initiative name"
                     autoFocus
                  />
                  <Textarea
                     value={description}
                     onChange={(event) => setDescription(event.target.value)}
                     placeholder="Description"
                  />
                  <Input
                     type="date"
                     value={targetDate}
                     onChange={(event) => setTargetDate(event.target.value)}
                  />
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
               </div>
               <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                     Cancel
                  </Button>
                  <Button onClick={() => void create()} disabled={submitting}>
                     {submitting ? 'Creating…' : 'Create initiative'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
