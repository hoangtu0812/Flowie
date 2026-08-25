'use client';

import ProjectsTimeline from '@/components/common/projects/projects-timeline';
import { ProjectGroup } from '@/components/common/projects/projects';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { authenticatedFetch } from '@/lib/workspaces';
import {
   adaptInitiatives,
   countCompletedProjects,
   getInitiativeProjects,
   Initiative,
   initiativeHealth,
   INITIATIVE_STATUS_META,
} from './initiative-ui-adapter';
import type { Project } from '@/types/projects';
import {
   CalendarRange,
   ChevronDown,
   FilePenLine,
   FileText,
   Plus,
   Tag,
   UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { InitiativeProgressPanel } from './initiative-progress-panel';
import { InitiativeStatusIcon } from './initiative-status-icon';
import { LiveWorkspaceProject, useLiveInitiatives } from './use-live-initiatives';

const TABS = ['overview', 'activity', 'projects'] as const;
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const formatTarget = (iso: string): string => {
   const [, month, day] = iso.split('-').map(Number);
   const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
   ];
   return `${months[(month ?? 1) - 1]} ${day}`;
};

/* ------------------------------ projects table ---------------------------- */

const GROUP_ORDER: { key: string; label: string; match: (project: ReturnType<typeof getInitiativeProjects>[number]) => boolean }[] = [
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
   onLinkProject,
}: {
   initiative: Initiative;
   onLinkProject: () => void;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const projects = getInitiativeProjects(initiative);
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
               aria-label="Link a project"
               className="text-muted-foreground hover:text-foreground transition-colors"
               onClick={onLinkProject}
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
                  <Link
                     key={project.id}
                     href={`/${orgId}/project/${project.id}/overview`}
                     className="flex items-center gap-2 py-2 text-sm hover:bg-sidebar/50 rounded-md px-1 -mx-1 transition-colors"
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
                           <AvatarImage src={project.lead.avatarUrl} alt={project.lead.name} />
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
               ))}
            </div>
         ))}
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

type InitiativeDetailAction = 'update' | 'resource' | 'project' | null;

function Overview({
   initiative,
   workspaceId,
   projects,
}: {
   initiative: Initiative;
   workspaceId?: string;
   projects: LiveWorkspaceProject[];
}) {
   const completed = countCompletedProjects(initiative);
   const total = getInitiativeProjects(initiative).length;
   const [action, setAction] = useState<InitiativeDetailAction>(null);
   const [updateBody, setUpdateBody] = useState('');
   const [updateHealth, setUpdateHealth] = useState(initiative.health.id);
   const [resourceLabel, setResourceLabel] = useState('');
   const [resourceUrl, setResourceUrl] = useState('');
   const [projectId, setProjectId] = useState('');
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const availableProjects = projects.filter(
      (project) => !initiative.projectLinks.some((link) => link.project.id === project.id)
   );

   const openAction = (nextAction: Exclude<InitiativeDetailAction, null>) => {
      setError(undefined);
      setAction(nextAction);
   };

   const submit = async () => {
      if (!action || !workspaceId) return;
      setSaving(true);
      setError(undefined);
      try {
         const path =
            action === 'update'
               ? 'updates'
               : action === 'resource'
                 ? 'resources'
                 : 'projects';
         const body =
            action === 'update'
               ? { workspaceId, body: updateBody.trim(), health: updateHealth }
               : action === 'resource'
                 ? { workspaceId, label: resourceLabel.trim(), url: resourceUrl.trim() }
                 : { workspaceId, projectId };
         const response = await authenticatedFetch(`${api}/initiatives/${initiative.id}/${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as { message?: string } | null;
            throw new Error(payload?.message ?? 'Could not save initiative changes.');
         }
         setAction(null);
         setUpdateBody('');
         setResourceLabel('');
         setResourceUrl('');
         setProjectId('');
         window.dispatchEvent(new Event('flowie:initiatives-changed'));
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not save initiative changes.');
      } finally {
         setSaving(false);
      }
   };

   const canSubmit =
      Boolean(workspaceId) &&
      (action === 'update'
         ? updateBody.trim().length > 0
         : action === 'resource'
           ? resourceLabel.trim().length > 0 && resourceUrl.trim().length > 0
           : projectId.length > 0);

   return (
      <>
         <div className="w-full h-full flex overflow-hidden">
         <div className="flex-1 min-w-0 overflow-y-auto">
            <div className="max-w-3xl mx-auto px-8 py-10 flex flex-col gap-6">
               <span className="inline-flex size-10 items-center justify-center rounded-md bg-muted/50 text-2xl">
                  {initiative.icon}
               </span>
               <div className="flex flex-col gap-2">
                  <h1 className="text-2xl font-semibold">{initiative.name}</h1>
                  <p className="text-sm text-muted-foreground">
                     {initiative.description ?? 'Add a short summary…'}
                  </p>
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
                  <button
                     type="button"
                     className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                     onClick={() => openAction('resource')}
                  >
                     <Plus className="size-4" />
                     Add document or link…
                  </button>
                  {initiative.resources.map((resource) => (
                     <a
                        key={resource.id}
                        href={resource.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors truncate max-w-40"
                     >
                        {resource.label}
                     </a>
                  ))}
               </div>

               <button
                  type="button"
                  className="flex items-center justify-center gap-2 rounded-lg border py-4 text-sm text-muted-foreground hover:bg-accent/40 transition-colors"
                  onClick={() => openAction('update')}
               >
                  <FilePenLine className="size-4" />
                  Write first initiative update
               </button>

               <div className="flex flex-col gap-2">
                  <h2 className="text-sm font-medium">Description</h2>
                  <p className="text-sm text-muted-foreground">
                     {initiative.description ?? 'Add description…'}
                  </p>
               </div>

               <ProjectsSection initiative={initiative} onLinkProject={() => openAction('project')} />
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
                  <button className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                     See all
                  </button>
               </div>
               <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                  {initiative.updates.slice(0, 2).map((update) => (
                     <span key={update.id} className="flex items-start gap-2">
                        <FilePenLine className="size-3.5 mt-px shrink-0" />
                        {update.author.name} posted an update · {formatTarget(update.createdAt)}
                     </span>
                  ))}
                  {initiative.updates.length === 0 && <span>No activity yet</span>}
               </div>
            </div>
         </aside>
         </div>
         <Dialog open={action !== null} onOpenChange={(open) => !saving && !open && setAction(null)}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>
                     {action === 'update'
                        ? 'Write initiative update'
                        : action === 'resource'
                          ? 'Add document or link'
                          : 'Link project'}
                  </DialogTitle>
               </DialogHeader>
               {action === 'update' && (
                  <div className="space-y-3">
                     <Textarea
                        value={updateBody}
                        onChange={(event) => setUpdateBody(event.target.value)}
                        placeholder="Share an update…"
                        autoFocus
                     />
                     <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="initiative-update-health">Health</label>
                        <Select
                           value={updateHealth}
                           onValueChange={(value) =>
                              setUpdateHealth(value as typeof updateHealth)
                           }
                        >
                           <SelectTrigger id="initiative-update-health"><SelectValue /></SelectTrigger>
                           <SelectContent>
                              {initiativeHealth.map((health) => (
                                 <SelectItem key={health.id} value={health.id}>{health.name}</SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     </div>
                  </div>
               )}
               {action === 'resource' && (
                  <div className="space-y-3">
                     <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="initiative-resource-label">Name</label>
                        <Input id="initiative-resource-label" value={resourceLabel} onChange={(event) => setResourceLabel(event.target.value)} autoFocus />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="initiative-resource-url">URL</label>
                        <Input id="initiative-resource-url" type="url" value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} placeholder="https://…" />
                     </div>
                  </div>
               )}
               {action === 'project' && (
                  <div className="space-y-2">
                     <label className="text-sm font-medium" htmlFor="initiative-project">Project</label>
                     <Select value={projectId} onValueChange={setProjectId}>
                        <SelectTrigger id="initiative-project"><SelectValue placeholder="Select a project" /></SelectTrigger>
                        <SelectContent>
                           {availableProjects.map((project) => (
                              <SelectItem key={project.id} value={project.id}>
                                 {project.name}{project.identifier ? ` · ${project.identifier}` : ''}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                     {availableProjects.length === 0 && <p className="text-sm text-muted-foreground">All workspace projects are already linked.</p>}
                  </div>
               )}
               {error && <p className="text-sm text-destructive">{error}</p>}
               <DialogFooter>
                  <Button variant="outline" onClick={() => setAction(null)} disabled={saving}>Cancel</Button>
                  <Button onClick={() => void submit()} disabled={saving || !canSubmit}>
                     {saving ? 'Saving…' : action === 'project' ? 'Link project' : action === 'resource' ? 'Add resource' : 'Post update'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </>
   );
}

/* ------------------------------- activity tab ----------------------------- */

function Activity({ initiative }: { initiative: Initiative }) {
   const events = initiative.updates.map((update) => ({
      id: update.id,
      label: `${update.author.name} posted an update`,
      date: formatTarget(update.createdAt),
   }));
   return (
      <div className="max-w-2xl mx-auto px-8 py-10 flex flex-col gap-4 w-full">
         <h2 className="text-lg font-medium">Activity</h2>
         <div className="flex flex-col">
            {events.map((event) => (
               <div
                  key={event.id}
                  className="flex items-center gap-3 py-3 border-b border-border/50 text-sm"
               >
                  <FileText className="size-4 text-muted-foreground shrink-0" />
                  <span className="flex-1">{event.label}</span>
                  <span className="text-xs text-muted-foreground">{event.date}</span>
               </div>
            ))}
            {events.length === 0 && <p className="py-8 text-sm text-muted-foreground">No activity yet.</p>}
         </div>
      </div>
   );
}

/* ---------------------------------- export -------------------------------- */

/** Initiative detail page: Overview / Activity / Projects tabs. */
export default function InitiativeDetails({ initiativeId }: { initiativeId: string }) {
   const [tab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('overview'));
   const { workspaceId, initiatives: liveInitiatives, projects, loading, error } = useLiveInitiatives();
   const initiatives = useMemo(() => adaptInitiatives(liveInitiatives), [liveInitiatives]);
   const initiative = initiatives.find((item) => item.id === initiativeId);

   const timelineGroups = useMemo<ProjectGroup[]>(() => {
      if (!initiative) return [];
      return [
         {
            id: initiative.id,
            name: initiative.name,
            icon: initiative.icon ?? undefined,
            // Timeline only consumes the presentation subset exposed by the
            // Initiative project adapter; the API deliberately does not
            // manufacture unrelated mock User fields.
            projects: getInitiativeProjects(initiative) as unknown as Project[],
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

   if (!initiative || error) {
      return (
         <div className="w-full h-full flex items-center justify-center text-sm text-muted-foreground">
            Initiative not found
         </div>
      );
   }

   if (tab === 'activity') return <Activity initiative={initiative} />;
   if (tab === 'projects') return <ProjectsTimeline groups={timelineGroups} />;
   return <Overview initiative={initiative} workspaceId={workspaceId} projects={projects} />;
}
