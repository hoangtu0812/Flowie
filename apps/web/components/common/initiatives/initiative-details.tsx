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
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
   Archive,
   CalendarRange,
   FileText,
   FolderKanban,
   Pencil,
   Plus,
   UserRound,
   X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { useLiveInitiatives } from './use-live-initiatives';

const TABS = ['overview', 'activity', 'projects'] as const;
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const label = (value: string) => value.replaceAll('-', ' ');
const dateLabel = (value: string | null) =>
   value
      ? new Intl.DateTimeFormat('en-US', {
           month: 'short',
           day: 'numeric',
           year: 'numeric',
        }).format(new Date(value))
      : 'No target date';
const dateInputValue = (value: string | null) => (value ? value.slice(0, 10) : '');
const initiativeStatuses = ['planned', 'active', 'completed', 'canceled'];
const initiativePriorities = ['none', 'low', 'medium', 'high', 'urgent'];
const initiativeHealth = ['no-update', 'on-track', 'at-risk', 'off-track'];

type InitiativeDraft = {
   name: string;
   description: string;
   status: string;
   priority: string;
   health: string;
   icon: string;
   targetDate: string;
};

export default function InitiativeDetails({ initiativeId }: { initiativeId: string }) {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const [tab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('overview'));
   const { workspaceId, initiatives, projects, loading, error, reload } = useLiveInitiatives();
   const [open, setOpen] = useState(false);
   const [editOpen, setEditOpen] = useState(false);
   const [projectId, setProjectId] = useState('');
   const [editDraft, setEditDraft] = useState<InitiativeDraft>({
      name: '',
      description: '',
      status: 'planned',
      priority: 'none',
      health: 'no-update',
      icon: '',
      targetDate: '',
   });
   const [submitting, setSubmitting] = useState(false);
   const [formError, setFormError] = useState<string>();
   const initiative = initiatives.find((item) => item.id === initiativeId);
   const linkedIds = useMemo(
      () => new Set(initiative?.projectLinks.map((link) => link.project.id)),
      [initiative]
   );
   const availableProjects = projects.filter((project) => !linkedIds.has(project.id));
   const openEdit = () => {
      if (!initiative) return;
      setFormError(undefined);
      setEditDraft({
         name: initiative.name,
         description: initiative.description ?? '',
         status: initiative.status,
         priority: initiative.priority,
         health: initiative.health,
         icon: initiative.icon ?? '',
         targetDate: dateInputValue(initiative.targetDate),
      });
      setEditOpen(true);
   };
   const linkProject = async () => {
      if (!initiative || !workspaceId || !projectId) return;
      setSubmitting(true);
      setFormError(undefined);
      try {
         const response = await fetch(`${api}/initiatives/${initiative.id}/projects`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, projectId }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not add project.');
         }
         setOpen(false);
         setProjectId('');
         reload();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not add project.');
      } finally {
         setSubmitting(false);
      }
   };
   const unlinkProject = async (linkedProjectId: string) => {
      if (!initiative || !workspaceId) return;
      setSubmitting(true);
      setFormError(undefined);
      try {
         const query = new URLSearchParams({ workspaceId });
         const response = await fetch(
            `${api}/initiatives/${initiative.id}/projects/${linkedProjectId}?${query}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not remove project.');
         }
         reload();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not remove project.');
      } finally {
         setSubmitting(false);
      }
   };
   const saveInitiative = async () => {
      if (!initiative || !workspaceId) return;
      if (editDraft.name.trim().length < 2) {
         setFormError('Initiative name must contain at least 2 characters.');
         return;
      }
      setSubmitting(true);
      setFormError(undefined);
      try {
         const query = new URLSearchParams({ workspaceId });
         const response = await fetch(`${api}/initiatives/${initiative.id}?${query}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               name: editDraft.name.trim(),
               description: editDraft.description.trim() || null,
               status: editDraft.status,
               priority: editDraft.priority,
               health: editDraft.health,
               icon: editDraft.icon.trim() || null,
               targetDate: editDraft.targetDate || null,
            }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string | string[];
            } | null;
            throw new Error(
               Array.isArray(payload?.message)
                  ? payload.message[0]
                  : (payload?.message ?? 'Could not update initiative.')
            );
         }
         setEditOpen(false);
         reload();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not update initiative.');
      } finally {
         setSubmitting(false);
      }
   };
   const archiveInitiative = async () => {
      if (!initiative || !workspaceId || !window.confirm(`Archive ${initiative.name}?`)) return;
      setSubmitting(true);
      setFormError(undefined);
      try {
         const query = new URLSearchParams({ workspaceId });
         const response = await fetch(`${api}/initiatives/${initiative.id}?${query}`, {
            method: 'DELETE',
            credentials: 'include',
         });
         if (!response.ok) throw new Error('Could not archive initiative.');
         router.push(`/${orgId}/initiatives`);
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not archive initiative.');
      } finally {
         setSubmitting(false);
      }
   };
   if (loading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading initiative…</div>;
   if (error || !initiative)
      return (
         <div className="px-8 py-10 text-sm text-destructive">
            {error ?? 'Initiative not found.'}
         </div>
      );
   const projectList = initiative.projectLinks.map((link) => link.project);
   if (tab === 'activity')
      return (
         <div className="max-w-2xl mx-auto px-8 py-10 flex flex-col gap-4 w-full">
            <h2 className="text-lg font-medium">Activity</h2>
            <div className="flex items-center gap-3 py-3 border-b border-border/50 text-sm">
               <FileText className="size-4 text-muted-foreground" />
               <span className="flex-1">
                  {initiative.owner?.name ?? 'A workspace member'} created this initiative
               </span>
               <span className="text-xs text-muted-foreground">
                  {dateLabel(initiative.createdAt)}
               </span>
            </div>
            <div className="flex items-center gap-3 py-3 border-b border-border/50 text-sm">
               <FileText className="size-4 text-muted-foreground" />
               <span className="flex-1">Last updated</span>
               <span className="text-xs text-muted-foreground">
                  {dateLabel(initiative.updatedAt)}
               </span>
            </div>
         </div>
      );
   if (tab === 'projects')
      return (
         <>
            <div className="max-w-4xl mx-auto px-8 py-10 w-full">
               <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-medium">Projects</h2>
                  <Button
                     size="xs"
                     variant="secondary"
                     onClick={() => setOpen(true)}
                     disabled={!availableProjects.length}
                  >
                     <Plus className="size-4 mr-1" />
                     Add project
                  </Button>
               </div>
               <div className="border rounded-lg">
                  {projectList.length ? (
                     projectList.map((project) => (
                        <div
                           key={project.id}
                           className="flex items-center border-b last:border-b-0 hover:bg-sidebar/50"
                        >
                           <Link
                              href={`/${orgId}/project/${project.id}/overview`}
                              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3"
                           >
                              <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
                              <span className="flex-1 truncate text-sm font-medium">
                                 {project.name}
                              </span>
                              <span className="capitalize text-xs text-muted-foreground">
                                 {label(project.status)}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                 {dateLabel(project.targetDate)}
                              </span>
                           </Link>
                           <button
                              type="button"
                              className="mr-3 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                              aria-label={`Remove ${project.name} from this initiative`}
                              title="Remove project"
                              disabled={submitting}
                              onClick={() => void unlinkProject(project.id)}
                           >
                              <X className="size-3.5" />
                           </button>
                        </div>
                     ))
                  ) : (
                     <p className="px-4 py-8 text-sm text-muted-foreground text-center">
                        No projects linked to this initiative.
                     </p>
                  )}
               </div>
               {formError && <p className="mt-3 text-sm text-destructive">{formError}</p>}
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
               <DialogContent>
                  <DialogHeader>
                     <DialogTitle>Add project</DialogTitle>
                     <DialogDescription>
                        Link an existing project to {initiative.name}.
                     </DialogDescription>
                  </DialogHeader>
                  <Select value={projectId} onValueChange={setProjectId}>
                     <SelectTrigger>
                        <SelectValue placeholder="Select a project" />
                     </SelectTrigger>
                     <SelectContent>
                        {availableProjects.map((project) => (
                           <SelectItem key={project.id} value={project.id}>
                              {project.name}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
                  <DialogFooter>
                     <Button variant="outline" onClick={() => setOpen(false)}>
                        Cancel
                     </Button>
                     <Button onClick={() => void linkProject()} disabled={!projectId || submitting}>
                        {submitting ? 'Adding…' : 'Add project'}
                     </Button>
                  </DialogFooter>
               </DialogContent>
            </Dialog>
         </>
      );
   return (
      <div className="w-full h-full flex overflow-hidden">
         <div className="flex-1 min-w-0 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10 flex flex-col gap-6">
               <span className="inline-flex size-10 items-center justify-center rounded-md bg-muted/50 text-2xl">
                  {initiative.icon ?? '🎯'}
               </span>
               <div className="flex items-start justify-between gap-4">
                  <div>
                     <h1 className="text-2xl font-semibold">{initiative.name}</h1>
                     <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                        {initiative.description || 'No description yet.'}
                     </p>
                  </div>
                  <Button size="xs" variant="secondary" onClick={openEdit} disabled={submitting}>
                     <Pencil className="size-3.5" /> Edit
                  </Button>
               </div>
               <div className="flex items-center gap-3 flex-wrap text-sm">
                  <span className="text-muted-foreground text-xs w-24">Properties</span>
                  <span className="capitalize">{label(initiative.status)}</span>
                  <span className="capitalize text-muted-foreground">
                     {label(initiative.priority)}
                  </span>
                  <span className="capitalize text-muted-foreground">
                     {label(initiative.health)}
                  </span>
                  {initiative.owner ? (
                     <span className="inline-flex items-center gap-1.5">
                        <Avatar className="size-4">
                           <AvatarImage
                              src={initiative.owner.avatarUrl ?? undefined}
                              alt={initiative.owner.name}
                           />
                           <AvatarFallback>{initiative.owner.name[0]}</AvatarFallback>
                        </Avatar>
                        {initiative.owner.name}
                     </span>
                  ) : (
                     <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <UserRound className="size-4" />
                        Unassigned
                     </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                     <CalendarRange className="size-4" />
                     {dateLabel(initiative.targetDate)}
                  </span>
               </div>
               <div>
                  <h2 className="text-sm font-medium mb-3">Projects</h2>
                  <div className="space-y-2">
                     {projectList.slice(0, 5).map((project) => (
                        <Link
                           key={project.id}
                           href={`/${orgId}/project/${project.id}/overview`}
                           className="flex items-center gap-2 text-sm hover:underline"
                        >
                           <FolderKanban className="size-4 text-muted-foreground" />
                           {project.name}
                        </Link>
                     ))}
                     {!projectList.length && (
                        <p className="text-sm text-muted-foreground">No projects linked yet.</p>
                     )}
                  </div>
               </div>
            </div>
         </div>
         <aside className="hidden lg:flex flex-col w-80 shrink-0 border-l h-full overflow-y-auto p-5 gap-4 bg-container">
            <h3 className="text-sm font-medium">Progress</h3>
            <p className="text-sm text-muted-foreground">{projectList.length} linked projects</p>
            <Button
               size="xs"
               variant="secondary"
               onClick={() => setOpen(true)}
               disabled={!availableProjects.length}
            >
               <Plus className="size-4 mr-1" />
               Add project
            </Button>
            <Button
               size="xs"
               variant="ghost"
               className="text-destructive hover:text-destructive"
               disabled={submitting}
               onClick={() => void archiveInitiative()}
            >
               <Archive className="size-3.5" /> Archive
            </Button>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
         </aside>
         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Add project</DialogTitle>
                  <DialogDescription>
                     Link an existing project to {initiative.name}.
                  </DialogDescription>
               </DialogHeader>
               <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                     <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                     {availableProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                           {project.name}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
               {formError && <p className="text-sm text-destructive">{formError}</p>}
               <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                     Cancel
                  </Button>
                  <Button onClick={() => void linkProject()} disabled={!projectId || submitting}>
                     {submitting ? 'Adding…' : 'Add project'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
         <Dialog open={editOpen} onOpenChange={setEditOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Edit initiative</DialogTitle>
                  <DialogDescription>
                     Update the initiative details for this workspace.
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <Input
                     value={editDraft.name}
                     onChange={(event) =>
                        setEditDraft((current) => ({ ...current, name: event.target.value }))
                     }
                     placeholder="Initiative name"
                  />
                  <Textarea
                     value={editDraft.description}
                     onChange={(event) =>
                        setEditDraft((current) => ({ ...current, description: event.target.value }))
                     }
                     placeholder="Description"
                  />
                  <div className="grid grid-cols-3 gap-3">
                     <Select
                        value={editDraft.status}
                        onValueChange={(status) =>
                           setEditDraft((current) => ({ ...current, status }))
                        }
                     >
                        <SelectTrigger>
                           <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                           {initiativeStatuses.map((status) => (
                              <SelectItem key={status} value={status}>
                                 {label(status)}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                     <Select
                        value={editDraft.priority}
                        onValueChange={(priority) =>
                           setEditDraft((current) => ({ ...current, priority }))
                        }
                     >
                        <SelectTrigger>
                           <SelectValue placeholder="Priority" />
                        </SelectTrigger>
                        <SelectContent>
                           {initiativePriorities.map((priority) => (
                              <SelectItem key={priority} value={priority}>
                                 {label(priority)}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                     <Select
                        value={editDraft.health}
                        onValueChange={(health) =>
                           setEditDraft((current) => ({ ...current, health }))
                        }
                     >
                        <SelectTrigger>
                           <SelectValue placeholder="Health" />
                        </SelectTrigger>
                        <SelectContent>
                           {initiativeHealth.map((health) => (
                              <SelectItem key={health} value={health}>
                                 {label(health)}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  <div className="grid grid-cols-[90px_1fr] gap-3">
                     <Input
                        value={editDraft.icon}
                        maxLength={16}
                        onChange={(event) =>
                           setEditDraft((current) => ({ ...current, icon: event.target.value }))
                        }
                        placeholder="Icon"
                        aria-label="Icon"
                     />
                     <Input
                        type="date"
                        value={editDraft.targetDate}
                        onChange={(event) =>
                           setEditDraft((current) => ({
                              ...current,
                              targetDate: event.target.value,
                           }))
                        }
                        aria-label="Target date"
                     />
                  </div>
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
               </div>
               <DialogFooter>
                  <Button
                     variant="outline"
                     onClick={() => setEditOpen(false)}
                     disabled={submitting}
                  >
                     Cancel
                  </Button>
                  <Button onClick={() => void saveInitiative()} disabled={submitting}>
                     {submitting ? 'Saving…' : 'Save changes'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
