'use client';

import ProjectsTimeline from '@/components/common/projects/projects-timeline';
import { ProjectGroup } from '@/components/common/projects/projects';
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
   CalendarRange,
   Archive,
   ChevronDown,
   FilePenLine,
   FileText,
   ExternalLink,
   Plus,
   Pencil,
   Tag,
   UserRound,
   X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { InitiativeProgressPanel } from './initiative-progress-panel';
import { InitiativeStatusIcon } from './initiative-status-icon';
import {
   adaptInitiative,
   countCompletedProjects,
   getInitiativeProjects,
   Initiative,
   InitiativeProject as Project,
   INITIATIVE_STATUS_META,
} from './initiative-ui-adapter';
import {
   LiveInitiative,
   LiveInitiativeActivity,
   LiveWorkspaceProject,
   useInitiativeActivity,
   useLiveInitiatives,
} from './use-live-initiatives';

const TABS = ['overview', 'activity', 'projects'] as const;
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const formatTarget = (iso: string): string => {
   return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
      new Date(iso)
   );
};

const metadataString = (activity: LiveInitiativeActivity, key: string) => {
   const value = activity.metadata?.[key];
   return typeof value === 'string' ? value : undefined;
};

const activityLabel = (activity: LiveInitiativeActivity) => {
   const actor = activity.actor?.name ?? 'Someone';
   if (activity.action === 'initiative.created') return `${actor} created the initiative`;
   if (activity.action === 'initiative.updated') return `${actor} updated the initiative`;
   if (activity.action === 'initiative.archived') return `${actor} archived the initiative`;
   if (activity.action === 'initiative.project.linked')
      return `${actor} added ${metadataString(activity, 'projectName') ?? 'a project'}`;
   if (activity.action === 'initiative.project.unlinked') return `${actor} removed a project`;
   if (activity.action === 'initiative.resource.added')
      return `${actor} added ${metadataString(activity, 'label') ?? 'a resource'}`;
   if (activity.action === 'initiative.update.posted')
      return `${actor} posted an initiative update`;
   return `${actor} ${activity.action.replaceAll('.', ' ')}`;
};

function EditInitiativeDialog({
   initiative,
   workspaceId,
   reload,
}: {
   initiative: LiveInitiative;
   workspaceId?: string;
   reload: () => void;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const [open, setOpen] = useState(false);
   const [name, setName] = useState(initiative.name);
   const [description, setDescription] = useState(initiative.description ?? '');
   const [status, setStatus] = useState(initiative.status);
   const [priority, setPriority] = useState(initiative.priority);
   const [health, setHealth] = useState(initiative.health);
   const [targetDate, setTargetDate] = useState(initiative.targetDate?.slice(0, 10) ?? '');
   const [submitting, setSubmitting] = useState(false);
   const [error, setError] = useState<string>();
   const reset = () => {
      setName(initiative.name);
      setDescription(initiative.description ?? '');
      setStatus(initiative.status);
      setPriority(initiative.priority);
      setHealth(initiative.health);
      setTargetDate(initiative.targetDate?.slice(0, 10) ?? '');
      setError(undefined);
   };
   const save = async () => {
      if (!workspaceId || name.trim().length < 2) {
         setError('Initiative name must contain at least 2 characters.');
         return;
      }
      setSubmitting(true);
      setError(undefined);
      try {
         const query = new URLSearchParams({ workspaceId });
         const response = await fetch(`${api}/initiatives/${initiative.id}?${query}`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               name: name.trim(),
               description: description.trim() || null,
               status,
               priority,
               health,
               targetDate: targetDate || null,
            }),
         });
         if (!response.ok) throw new Error('Could not update initiative.');
         setOpen(false);
         reload();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not update initiative.');
      } finally {
         setSubmitting(false);
      }
   };
   const archive = async () => {
      if (!workspaceId || !window.confirm(`Archive ${initiative.name}?`)) return;
      setSubmitting(true);
      setError(undefined);
      try {
         const query = new URLSearchParams({ workspaceId });
         const response = await fetch(`${api}/initiatives/${initiative.id}?${query}`, {
            method: 'DELETE',
            credentials: 'include',
         });
         if (!response.ok) throw new Error('Could not archive initiative.');
         router.push(`/${orgId}/initiatives`);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not archive initiative.');
      } finally {
         setSubmitting(false);
      }
   };
   return (
      <Dialog
         open={open}
         onOpenChange={(next) => {
            setOpen(next);
            if (next) reset();
         }}
      >
         <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
            <Pencil className="size-3.5" />
            Edit
         </Button>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Edit initiative</DialogTitle>
               <DialogDescription>Update the initiative properties.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
               <Input value={name} onChange={(event) => setName(event.target.value)} />
               <Textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
               />
               <div className="grid grid-cols-3 gap-2">
                  <Select value={status} onValueChange={setStatus}>
                     <SelectTrigger>
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {['planned', 'active', 'completed', 'canceled'].map((value) => (
                           <SelectItem key={value} value={value}>
                              {value}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
                  <Select value={priority} onValueChange={setPriority}>
                     <SelectTrigger>
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {['none', 'low', 'medium', 'high', 'urgent'].map((value) => (
                           <SelectItem key={value} value={value}>
                              {value}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
                  <Select value={health} onValueChange={setHealth}>
                     <SelectTrigger>
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {['no-update', 'on-track', 'at-risk', 'off-track'].map((value) => (
                           <SelectItem key={value} value={value}>
                              {value}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </div>
               <Input
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
               />
               {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter className="sm:justify-between">
               <Button variant="destructive" onClick={() => void archive()} disabled={submitting}>
                  <Archive className="size-4" /> Archive
               </Button>
               <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                     Cancel
                  </Button>
                  <Button onClick={() => void save()} disabled={submitting}>
                     {submitting ? 'Saving…' : 'Save'}
                  </Button>
               </div>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

function InitiativeUpdateDialog({
   initiative,
   workspaceId,
   onSaved,
}: {
   initiative: Initiative;
   workspaceId?: string;
   onSaved: () => void;
}) {
   const [open, setOpen] = useState(false);
   const [body, setBody] = useState('');
   const [health, setHealth] = useState<string>(initiative.health.id);
   const [submitting, setSubmitting] = useState(false);
   const [error, setError] = useState<string>();
   const save = async () => {
      if (!workspaceId || !body.trim()) return;
      setSubmitting(true);
      setError(undefined);
      try {
         const response = await fetch(`${api}/initiatives/${initiative.id}/updates`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, body: body.trim(), health }),
         });
         if (!response.ok) throw new Error('Could not post initiative update.');
         setOpen(false);
         setBody('');
         onSaved();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not post initiative update.');
      } finally {
         setSubmitting(false);
      }
   };
   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full flex items-center justify-center gap-2 rounded-lg border py-4 text-sm text-muted-foreground hover:bg-accent/40 transition-colors"
         >
            <FilePenLine className="size-4" />
            Write initiative update
         </button>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Initiative update</DialogTitle>
               <DialogDescription>Share progress and current health.</DialogDescription>
            </DialogHeader>
            <Textarea
               value={body}
               onChange={(event) => setBody(event.target.value)}
               placeholder="What changed?"
               rows={6}
               autoFocus
            />
            <Select value={health} onValueChange={setHealth}>
               <SelectTrigger>
                  <SelectValue />
               </SelectTrigger>
               <SelectContent>
                  {['no-update', 'on-track', 'at-risk', 'off-track'].map((value) => (
                     <SelectItem key={value} value={value}>
                        {value}
                     </SelectItem>
                  ))}
               </SelectContent>
            </Select>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
               <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
               </Button>
               <Button disabled={submitting || !body.trim()} onClick={() => void save()}>
                  {submitting ? 'Posting…' : 'Post update'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

function InitiativeResourceDialog({
   initiativeId,
   workspaceId,
   onSaved,
}: {
   initiativeId: string;
   workspaceId?: string;
   onSaved: () => void;
}) {
   const [open, setOpen] = useState(false);
   const [label, setLabel] = useState('');
   const [url, setUrl] = useState('');
   const [submitting, setSubmitting] = useState(false);
   const [error, setError] = useState<string>();
   const save = async () => {
      if (!workspaceId || !label.trim() || !url.trim()) return;
      setSubmitting(true);
      setError(undefined);
      try {
         const response = await fetch(`${api}/initiatives/${initiativeId}/resources`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, label: label.trim(), url: url.trim() }),
         });
         if (!response.ok) throw new Error('Could not add the resource.');
         setOpen(false);
         setLabel('');
         setUrl('');
         onSaved();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not add the resource.');
      } finally {
         setSubmitting(false);
      }
   };
   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
         >
            <Plus className="size-4" /> Add document or link…
         </button>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Add resource</DialogTitle>
               <DialogDescription>Link a document or external resource.</DialogDescription>
            </DialogHeader>
            <Input
               value={label}
               onChange={(event) => setLabel(event.target.value)}
               placeholder="Resource name"
               autoFocus
            />
            <Input
               value={url}
               onChange={(event) => setUrl(event.target.value)}
               placeholder="https://…"
               type="url"
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
               <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
               </Button>
               <Button
                  disabled={submitting || !label.trim() || !url.trim()}
                  onClick={() => void save()}
               >
                  {submitting ? 'Adding…' : 'Add resource'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/* ------------------------------ projects table ---------------------------- */

const GROUP_ORDER: { key: string; label: string; match: (project: Project) => boolean }[] = [
   { key: 'in-progress', label: 'In Progress', match: (p) => p.status.category === 'started' },
   { key: 'planned', label: 'Planned', match: (p) => p.status.category === 'unstarted' },
   {
      key: 'backlog',
      label: 'Backlog',
      match: (p) => p.status.category === 'backlog' || p.status.category === 'triage',
   },
   { key: 'completed', label: 'Completed', match: (p) => p.status.category === 'completed' },
];

function ProjectsSection({
   initiative,
   workspaceId,
   workspaceProjects,
   reload,
}: {
   initiative: Initiative;
   workspaceId?: string;
   workspaceProjects: LiveWorkspaceProject[];
   reload: () => void;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const projects = getInitiativeProjects(initiative);
   const [open, setOpen] = useState(false);
   const [projectId, setProjectId] = useState('');
   const [submitting, setSubmitting] = useState(false);
   const [error, setError] = useState<string>();
   const linkedIds = new Set(projects.map((project) => project.id));
   const availableProjects = workspaceProjects.filter((project) => !linkedIds.has(project.id));
   const linkProject = async () => {
      if (!workspaceId || !projectId) return;
      setSubmitting(true);
      setError(undefined);
      try {
         const response = await fetch(`${api}/initiatives/${initiative.id}/projects`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, projectId }),
         });
         if (!response.ok) throw new Error('Could not add project.');
         setOpen(false);
         setProjectId('');
         reload();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not add project.');
      } finally {
         setSubmitting(false);
      }
   };
   const unlinkProject = async (linkedProjectId: string) => {
      if (!workspaceId) return;
      setSubmitting(true);
      setError(undefined);
      try {
         const query = new URLSearchParams({ workspaceId });
         const response = await fetch(
            `${api}/initiatives/${initiative.id}/projects/${linkedProjectId}?${query}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not remove project.');
         reload();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not remove project.');
      } finally {
         setSubmitting(false);
      }
   };
   const groups = GROUP_ORDER.map((group) => ({
      ...group,
      projects: projects.filter(group.match),
   })).filter((group) => group.projects.length > 0);

   return (
      <section className="flex flex-col gap-2">
         <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Projects</h2>
            <button
               type="button"
               aria-label="Add project"
               className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
               disabled={!availableProjects.length}
               onClick={() => setOpen(true)}
            >
               <Plus className="size-4" />
            </button>
         </div>
         <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground border-b">
            <span className="flex-1">Name</span>
            <span className="hidden sm:block w-16 shrink-0">Health</span>
            <span className="hidden sm:block w-16 shrink-0">Priority</span>
            <span className="hidden md:block w-12 shrink-0">Lead</span>
            <span className="hidden md:block w-24 shrink-0">Target date</span>
            <span className="w-16 shrink-0">Status</span>
         </div>
         {groups.map((group) => (
            <div key={group.key} className="flex flex-col">
               <div className="flex items-center gap-2 py-1.5 text-xs text-muted-foreground">
                  <ChevronDown className="size-3" />
                  {group.label}
                  <span className="flex-1 border-b border-border/60" />
               </div>
               {group.projects.map((project) => (
                  <div
                     key={project.id}
                     className="flex items-center hover:bg-sidebar/50 rounded-md px-1 -mx-1 transition-colors"
                  >
                     <Link
                        href={`/${orgId}/project/${project.id}/overview`}
                        className="flex flex-1 min-w-0 items-center gap-2 py-2 text-sm"
                     >
                        <project.icon className="size-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 truncate font-medium">{project.name}</span>
                        <span className="hidden sm:block w-16 shrink-0">
                           <span
                              className="size-2.5 rounded-full inline-block"
                              style={{ backgroundColor: project.health.color }}
                           />
                        </span>
                        <span className="hidden sm:block w-16 shrink-0">
                           <project.priority.icon className="size-4 text-muted-foreground" />
                        </span>
                        <span className="hidden md:block w-12 shrink-0">
                           <Avatar className="size-5">
                              <AvatarImage
                                 src={project.lead.avatarUrl || undefined}
                                 alt={project.lead.name}
                              />
                              <AvatarFallback className="text-[9px]">
                                 {project.lead.name[0]}
                              </AvatarFallback>
                           </Avatar>
                        </span>
                        <span className="hidden md:flex items-center gap-1 w-24 shrink-0 text-xs text-muted-foreground">
                           {project.targetDate ? (
                              <>
                                 <CalendarRange className="size-3.5" />
                                 {formatTarget(project.targetDate)}
                              </>
                           ) : (
                              '—'
                           )}
                        </span>
                        <span className="w-16 shrink-0 text-xs text-muted-foreground">
                           {project.percentComplete}%
                        </span>
                     </Link>
                     <button
                        type="button"
                        aria-label={`Remove ${project.name} from initiative`}
                        className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
                        disabled={submitting}
                        onClick={() => void unlinkProject(project.id)}
                     >
                        <X className="size-3.5" />
                     </button>
                  </div>
               ))}
            </div>
         ))}
         {projects.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
               No projects linked to this initiative.
            </div>
         )}
         {error && <p className="text-sm text-destructive">{error}</p>}
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
               {error && <p className="text-sm text-destructive">{error}</p>}
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
      </section>
   );
}

/* ------------------------------- overview tab ----------------------------- */

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
   return (
      <div className="flex items-center gap-2 text-sm">
         <span className="w-24 text-muted-foreground text-xs shrink-0">{label}</span>
         {children}
      </div>
   );
}

function Overview({
   initiative,
   liveInitiative,
   workspaceId,
   workspaceProjects,
   activities,
   reloadActivity,
   reload,
}: {
   initiative: Initiative;
   liveInitiative: LiveInitiative;
   workspaceId?: string;
   workspaceProjects: LiveWorkspaceProject[];
   activities: LiveInitiativeActivity[];
   reloadActivity: () => void;
   reload: () => void;
}) {
   const completed = countCompletedProjects(initiative);
   const total = initiative.projects.length;
   const resources = activities.filter(
      (activity) =>
         activity.action === 'initiative.resource.added' &&
         metadataString(activity, 'label') &&
         metadataString(activity, 'url')
   );
   const recentActivity = activities.slice(0, 3);

   return (
      <div className="w-full h-full flex overflow-hidden">
         <div className="flex-1 min-w-0 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10 flex flex-col gap-6">
               <span className="inline-flex size-10 items-center justify-center rounded-md bg-muted/50 text-2xl">
                  {initiative.icon}
               </span>
               <div className="flex items-start justify-between gap-4">
                  <div className="flex flex-col gap-2">
                     <h1 className="text-2xl font-semibold">{initiative.name}</h1>
                     <p className="text-sm text-muted-foreground">
                        {initiative.description ?? 'Add a short summary…'}
                     </p>
                  </div>
                  <EditInitiativeDialog
                     initiative={liveInitiative}
                     workspaceId={workspaceId}
                     reload={reload}
                  />
               </div>

               <div className="flex items-center gap-3 flex-wrap text-sm">
                  <span className="text-muted-foreground text-xs w-24">Properties</span>
                  <span className="inline-flex items-center gap-1.5">
                     <InitiativeStatusIcon status={initiative.status} />
                     {INITIATIVE_STATUS_META[initiative.status].label}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                     <initiative.priority.icon className="size-4" />
                     {initiative.priority.name}
                  </span>
                  {initiative.owner ? (
                     <span className="inline-flex items-center gap-1.5">
                        <Avatar className="size-4">
                           <AvatarImage
                              src={initiative.owner.avatarUrl ?? undefined}
                              alt={initiative.owner.name}
                           />
                           <AvatarFallback className="text-[8px]">
                              {initiative.owner.name[0]}
                           </AvatarFallback>
                        </Avatar>
                        {initiative.owner.name}
                     </span>
                  ) : (
                     <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <UserRound className="size-4" /> Owner
                     </span>
                  )}
                  {initiative.target && (
                     <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <CalendarRange className="size-4" />
                        {initiative.target}
                     </span>
                  )}
               </div>

               <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground text-xs w-24">Resources</span>
                  <div className="flex items-center gap-2 flex-wrap">
                     {resources.map((resource) => (
                        <a
                           key={resource.id}
                           href={metadataString(resource, 'url')}
                           target="_blank"
                           rel="noreferrer"
                           className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs hover:bg-accent"
                        >
                           <ExternalLink className="size-3" />
                           {metadataString(resource, 'label')}
                        </a>
                     ))}
                     <InitiativeResourceDialog
                        initiativeId={initiative.id}
                        workspaceId={workspaceId}
                        onSaved={reloadActivity}
                     />
                  </div>
               </div>

               <InitiativeUpdateDialog
                  initiative={initiative}
                  workspaceId={workspaceId}
                  onSaved={() => {
                     reload();
                     reloadActivity();
                  }}
               />

               <div className="flex flex-col gap-2">
                  <h2 className="text-sm font-medium">Description</h2>
                  <p className="text-sm text-muted-foreground">
                     {initiative.description ?? 'Add description…'}
                  </p>
               </div>

               <ProjectsSection
                  initiative={initiative}
                  workspaceId={workspaceId}
                  workspaceProjects={workspaceProjects}
                  reload={reload}
               />
            </div>
         </div>

         <aside className="hidden lg:flex flex-col w-80 shrink-0 border-l h-full overflow-y-auto p-5 gap-6 bg-container">
            <div className="flex flex-col gap-3">
               <span className="text-sm font-medium">Properties</span>
               <PropertyRow label="Status">
                  <span className="inline-flex items-center gap-1.5">
                     <InitiativeStatusIcon status={initiative.status} />
                     {INITIATIVE_STATUS_META[initiative.status].label}
                  </span>
               </PropertyRow>
               <PropertyRow label="Priority">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                     <initiative.priority.icon className="size-4" />
                     {initiative.priority.name}
                  </span>
               </PropertyRow>
               <PropertyRow label="Owner">
                  {initiative.owner ? (
                     <span className="inline-flex items-center gap-1.5">
                        <Avatar className="size-4">
                           <AvatarImage
                              src={initiative.owner.avatarUrl ?? undefined}
                              alt={initiative.owner.name}
                           />
                           <AvatarFallback className="text-[8px]">
                              {initiative.owner.name[0]}
                           </AvatarFallback>
                        </Avatar>
                        {initiative.owner.name}
                     </span>
                  ) : (
                     <span className="text-muted-foreground inline-flex items-center gap-1.5">
                        <UserRound className="size-4" /> Add owner
                     </span>
                  )}
               </PropertyRow>
               <PropertyRow label="Target date">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                     <CalendarRange className="size-4" />
                     {initiative.target ?? 'Add target date'}
                  </span>
               </PropertyRow>
               <PropertyRow label="Labels">
                  <span className="text-muted-foreground inline-flex items-center gap-1.5">
                     <Tag className="size-4" /> Add label
                  </span>
               </PropertyRow>
               <PropertyRow label="Projects">
                  <span className="text-muted-foreground text-xs">
                     {completed} / {total} completed
                  </span>
               </PropertyRow>
            </div>

            <InitiativeProgressPanel initiative={initiative} />

            <div className="flex flex-col gap-3">
               <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Activity</span>
                  <Link
                     href={`?tab=activity`}
                     className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                     See all
                  </Link>
               </div>
               <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                  {recentActivity.map((activity) => (
                     <span key={activity.id} className="flex items-start gap-2">
                        <FileText className="size-3.5 mt-px shrink-0" />
                        {activityLabel(activity)} · {formatTarget(activity.createdAt)}
                     </span>
                  ))}
                  {recentActivity.length === 0 && <span>No activity yet.</span>}
               </div>
            </div>
         </aside>
      </div>
   );
}

/* ------------------------------- activity tab ----------------------------- */

function Activity({
   activities,
   loading,
   error,
}: {
   activities: LiveInitiativeActivity[];
   loading: boolean;
   error?: string;
}) {
   return (
      <div className="max-w-2xl mx-auto px-8 py-10 flex flex-col gap-4 w-full">
         <h2 className="text-lg font-medium">Activity</h2>
         <div className="flex flex-col">
            {activities.map((activity) => (
               <div
                  key={activity.id}
                  className="flex items-start gap-3 py-3 border-b border-border/50 text-sm"
               >
                  <FileText className="size-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                     <p>{activityLabel(activity)}</p>
                     {activity.action === 'initiative.update.posted' &&
                        metadataString(activity, 'body') && (
                           <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
                              {metadataString(activity, 'body')}
                           </p>
                        )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                     {formatTarget(activity.createdAt)}
                  </span>
               </div>
            ))}
            {loading && <p className="py-6 text-sm text-muted-foreground">Loading activity…</p>}
            {error && <p className="py-6 text-sm text-destructive">{error}</p>}
            {!loading && !error && activities.length === 0 && (
               <p className="py-6 text-sm text-muted-foreground">No activity yet.</p>
            )}
         </div>
      </div>
   );
}

/* ---------------------------------- export -------------------------------- */

/** Initiative detail page: Overview / Activity / Projects tabs. */
export default function InitiativeDetails({ initiativeId }: { initiativeId: string }) {
   const [tab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('overview'));
   const { workspaceId, initiatives, projects, loading, error, reload } = useLiveInitiatives();
   const liveInitiative = initiatives.find((item) => item.id === initiativeId);
   const initiative = useMemo(
      () => (liveInitiative ? adaptInitiative(liveInitiative) : undefined),
      [liveInitiative]
   );
   const {
      activities,
      loading: activityLoading,
      error: activityError,
      reload: reloadActivity,
   } = useInitiativeActivity(initiativeId, workspaceId);

   const timelineGroups = useMemo<ProjectGroup[]>(() => {
      if (!initiative) return [];
      return [
         {
            id: initiative.id,
            name: initiative.name,
            icon: initiative.icon ?? undefined,
            // The timeline only reads the shared project presentation fields supplied
            // by the live adapter (dates, status, priority, health, lead and icon).
            projects: getInitiativeProjects(initiative) as unknown as ProjectGroup['projects'],
         },
      ];
   }, [initiative]);

   if (loading) {
      return (
         <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
            Loading initiative…
         </div>
      );
   }

   if (error || !initiative) {
      return (
         <div className="w-full h-full flex items-center justify-center text-sm text-destructive">
            {error ?? 'Initiative not found'}
         </div>
      );
   }

   if (tab === 'activity')
      return <Activity activities={activities} loading={activityLoading} error={activityError} />;
   if (tab === 'projects') return <ProjectsTimeline groups={timelineGroups} />;
   return (
      <Overview
         initiative={initiative}
         liveInitiative={liveInitiative!}
         workspaceId={workspaceId}
         workspaceProjects={projects}
         activities={activities}
         reloadActivity={reloadActivity}
         reload={reload}
      />
   );
}
