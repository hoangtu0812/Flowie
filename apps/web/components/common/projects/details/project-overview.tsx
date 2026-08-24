'use client';

import { ContentBlocks } from '@/components/common/issues/details/content-blocks';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { format, parseISO } from 'date-fns';
import { ArrowRight, ChevronDown, FileText, PenLine, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { DocumentOutline, getOutlineItems } from './document-outline';
import { toIssueUi, toProjectDetailUi, toProjectUi } from './project-detail-ui-adapter';
import { ProjectSidePanel } from './project-side-panel';
import { useLiveProject } from './use-live-project';
import type { LiveProjectInitiative } from './use-live-project';
import { ProjectLabelSelector } from '../project-label-selector';

interface ProjectOverviewProps {
   projectId: string;
}

const formatDay = (iso?: string | null) => (iso ? format(parseISO(iso), 'MMM do') : '—');

function ProjectResourceDialog({
   onCreate,
}: {
   onCreate: (label: string, url: string) => Promise<unknown>;
}) {
   const [open, setOpen] = useState(false);
   const [label, setLabel] = useState('');
   const [url, setUrl] = useState('');
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   const save = async () => {
      setSaving(true);
      setError(undefined);
      try {
         await onCreate(label, url);
         setOpen(false);
         setLabel('');
         setUrl('');
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not add project resource.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <button
            type="button"
            aria-label="Add project resource"
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setOpen(true)}
         >
            <Plus className="size-3.5" />
         </button>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Add resource</DialogTitle>
               <DialogDescription>
                  Link a document or external resource to this project.
               </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
               <div className="space-y-1.5">
                  <Label htmlFor="project-resource-label">Label</Label>
                  <Input
                     id="project-resource-label"
                     value={label}
                     onChange={(event) => setLabel(event.target.value)}
                     placeholder="Project brief"
                  />
               </div>
               <div className="space-y-1.5">
                  <Label htmlFor="project-resource-url">URL</Label>
                  <Input
                     id="project-resource-url"
                     value={url}
                     onChange={(event) => setUrl(event.target.value)}
                     placeholder="https://…"
                     type="url"
                  />
               </div>
               {error && <p className="text-sm text-destructive">{error}</p>}
            </div>
            <DialogFooter>
               <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
               </Button>
               <Button
                  onClick={() => void save()}
                  disabled={saving || !label.trim() || !url.trim()}
               >
                  {saving ? 'Adding…' : 'Add resource'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

function ProjectInitiativesDialog({
   initiatives,
   selectedIds,
   onSave,
}: {
   initiatives: LiveProjectInitiative[];
   selectedIds: string[];
   onSave: (initiativeIds: string[]) => Promise<void>;
}) {
   const [open, setOpen] = useState(false);
   const [draft, setDraft] = useState<string[]>(selectedIds);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   const show = () => {
      setDraft(selectedIds);
      setError(undefined);
      setOpen(true);
   };
   const save = async () => {
      setSaving(true);
      setError(undefined);
      try {
         await onSave(draft);
         setOpen(false);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not update initiatives.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <button
            type="button"
            aria-label="Edit project initiatives"
            className="text-muted-foreground hover:text-foreground transition-colors"
            onClick={show}
         >
            <Plus className="size-3.5" />
         </button>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Project initiatives</DialogTitle>
               <DialogDescription>Select the initiatives linked to this project.</DialogDescription>
            </DialogHeader>
            <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
               {initiatives.map((initiative) => {
                  const checked = draft.includes(initiative.id);
                  return (
                     <label
                        key={initiative.id}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm"
                     >
                        <Checkbox
                           checked={checked}
                           onCheckedChange={(next) =>
                              setDraft((current) =>
                                 next
                                    ? [...new Set([...current, initiative.id])]
                                    : current.filter((id) => id !== initiative.id)
                              )
                           }
                        />
                        {initiative.name}
                     </label>
                  );
               })}
               {initiatives.length === 0 && (
                  <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                     No initiatives have been created in this workspace.
                  </p>
               )}
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
               <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
               </Button>
               <Button disabled={saving} onClick={() => void save()}>
                  {saving ? 'Saving…' : 'Save'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

function ProjectDescriptionDialog({
   value,
   trigger,
   onSave,
}: {
   value: string;
   trigger: ReactNode;
   onSave: (description: string) => Promise<unknown>;
}) {
   const [open, setOpen] = useState(false);
   const [draft, setDraft] = useState(value);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const save = async () => {
      setSaving(true);
      setError(undefined);
      try {
         await onSave(draft);
         setOpen(false);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not update description.');
      } finally {
         setSaving(false);
      }
   };
   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <div
            role="button"
            tabIndex={0}
            className="w-full text-left"
            onClick={() => {
               setDraft(value);
               setError(undefined);
               setOpen(true);
            }}
            onKeyDown={(event) => {
               if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  setDraft(value);
                  setError(undefined);
                  setOpen(true);
               }
            }}
         >
            {trigger}
         </div>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>Project description</DialogTitle>
               <DialogDescription>
                  Update the summary and detailed project context.
               </DialogDescription>
            </DialogHeader>
            <Textarea
               value={draft}
               onChange={(event) => setDraft(event.target.value)}
               rows={12}
               autoFocus
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <DialogFooter>
               <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
               </Button>
               <Button disabled={saving} onClick={() => void save()}>
                  {saving ? 'Saving…' : 'Save'}
               </Button>
            </DialogFooter>
         </DialogContent>
      </Dialog>
   );
}

/** Project "Overview" tab: description column + properties side panel. */
export default function ProjectOverview({ projectId }: ProjectOverviewProps) {
   const {
      project,
      issues,
      milestones,
      updates,
      activities,
      availableLabels,
      availableInitiatives,
      availableMembers,
      availableTeams,
      availableStatuses,
      updateLabels,
      updateInitiatives,
      updateMembers,
      updateProject,
      createMilestone,
      toggleMilestone,
      createResource,
      loading,
      error,
   } = useLiveProject(projectId);
   const { orgId } = useParams<{ orgId: string }>();
   const scrollRef = useRef<HTMLDivElement>(null);
   const uiProject = useMemo(
      () => (project ? toProjectUi(project, issues) : undefined),
      [issues, project]
   );
   const detail = useMemo(
      () => (project ? toProjectDetailUi(project, milestones, updates, activities) : undefined),
      [activities, milestones, project, updates]
   );
   const uiIssues = useMemo(
      () => (uiProject ? issues.map((issue) => toIssueUi(issue, uiProject)) : []),
      [issues, uiProject]
   );
   const outlineItems = useMemo(
      () => getOutlineItems(detail?.description ?? []),
      [detail?.description]
   );

   if (loading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading project…</div>;
   if (error || !project || !uiProject || !detail)
      return (
         <div className="px-8 py-10 text-sm text-destructive">{error ?? 'Project not found.'}</div>
      );

   return (
      <div className="w-full h-full flex overflow-hidden">
         {/* Main column */}
         <div className="flex-1 min-w-0 h-full relative">
            <DocumentOutline items={outlineItems} scrollRef={scrollRef} />
            <div ref={scrollRef} className="h-full overflow-y-auto">
               <div className="max-w-3xl mx-auto px-6 lg:px-10 py-10">
                  <div className="inline-flex size-10 bg-muted/50 items-center justify-center rounded-md mb-4">
                     <uiProject.icon className="size-6" />
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight">{uiProject.name}</h1>
                  <ProjectDescriptionDialog
                     value={project.description ?? ''}
                     onSave={(description) => updateProject({ description })}
                     trigger={
                        <p className="mt-3 text-muted-foreground leading-relaxed">
                           {detail.summary || 'No summary yet.'}
                        </p>
                     }
                  />

                  {/* Inline properties */}
                  <div className="mt-6 flex flex-col gap-2.5 text-sm">
                     <div className="flex items-center gap-3">
                        <span className="w-24 text-muted-foreground shrink-0">Properties</span>
                        <div className="flex items-center gap-3 flex-wrap">
                           <span className="inline-flex items-center gap-1.5">
                              <uiProject.status.icon />
                              {uiProject.status.name}
                           </span>
                           <span className="inline-flex items-center gap-1.5">
                              <uiProject.priority.icon className="size-3.5 text-muted-foreground" />
                              {uiProject.priority.name}
                           </span>
                           <span className="inline-flex items-center gap-1.5">
                              <Avatar className="size-4">
                                 <AvatarImage
                                    src={uiProject.lead.avatarUrl || undefined}
                                    alt={uiProject.lead.name}
                                 />
                                 <AvatarFallback>{uiProject.lead.name[0]}</AvatarFallback>
                              </Avatar>
                              {uiProject.lead.name}
                           </span>
                           <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              {formatDay(uiProject.startDate)}
                              <ArrowRight className="size-3" />
                              {formatDay(uiProject.targetDate)}
                           </span>
                           {uiProject.team && (
                              <span className="inline-flex items-center gap-1.5">
                                 {uiProject.team.icon ?? '👥'} {uiProject.team.name}
                              </span>
                           )}
                        </div>
                     </div>

                     <div className="flex items-center gap-3">
                        <span className="w-24 text-muted-foreground shrink-0">Initiatives</span>
                        <span className="inline-flex items-center gap-1.5">
                           {project.initiativeLinks.length > 0 && (
                              <>
                                 📄{' '}
                                 {project.initiativeLinks
                                    .map((link) => link.initiative.name)
                                    .join(', ')}
                              </>
                           )}
                           <ProjectInitiativesDialog
                              initiatives={availableInitiatives}
                              selectedIds={project.initiativeLinks.map(
                                 (link) => link.initiative.id
                              )}
                              onSave={updateInitiatives}
                           />
                        </span>
                     </div>

                     <div className="flex items-center gap-3">
                        <span className="w-24 text-muted-foreground shrink-0">Labels</span>
                        <div className="flex items-center gap-1.5">
                           {uiProject.labels.map((label) => (
                              <span
                                 key={label.id}
                                 className="inline-flex items-center gap-1 text-xs border rounded-full px-2 py-0.5"
                              >
                                 <span
                                    className="size-2 rounded-full"
                                    style={{ backgroundColor: label.color }}
                                 />
                                 {label.name}
                                 <ChevronDown className="size-3 text-muted-foreground" />
                              </span>
                           ))}
                           <ProjectLabelSelector
                              labels={project.labelLinks.map((link) => link.label)}
                              availableLabels={availableLabels}
                              onLabelsChange={updateLabels}
                              plainTrigger
                           />
                        </div>
                     </div>

                     <div className="flex items-center gap-3">
                        <span className="w-24 text-muted-foreground shrink-0">Resources</span>
                        <div className="flex items-center gap-2 flex-wrap">
                           {detail.resources.map((resource) => (
                              <a
                                 key={`${resource.label}-${resource.url}`}
                                 href={resource.url}
                                 target="_blank"
                                 rel="noreferrer"
                                 className="inline-flex items-center gap-1.5 text-xs border rounded-md px-2 py-1 hover:bg-accent/50 transition-colors"
                              >
                                 <FileText className="size-3.5 text-muted-foreground" />
                                 {resource.label}
                              </a>
                           ))}
                           <ProjectResourceDialog onCreate={createResource} />
                        </div>
                     </div>
                  </div>

                  {/* Update CTA */}
                  <Link
                     href={`/${orgId}/project/${uiProject.id}/activity`}
                     className="mt-8 flex items-center justify-center gap-2 border rounded-lg py-4 text-sm text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
                  >
                     <PenLine className="size-4" />
                     Write {detail.updates.length === 0 ? 'first ' : ''}project update
                  </Link>

                  {/* Description */}
                  <div className="mt-10">
                     <div className="flex items-center gap-1 text-sm font-medium text-muted-foreground mb-2">
                        Description
                        <ChevronDown className="size-3.5" />
                     </div>
                     <ProjectDescriptionDialog
                        value={project.description ?? ''}
                        onSave={(description) => updateProject({ description })}
                        trigger={
                           <div className="text-[15px] leading-relaxed">
                              {detail.description.length ? (
                                 <ContentBlocks blocks={detail.description} />
                              ) : (
                                 <p className="text-muted-foreground">No description yet.</p>
                              )}
                           </div>
                        }
                     />
                  </div>
               </div>
            </div>
         </div>

         {/* Side panel */}
         <ProjectSidePanel
            project={uiProject}
            detail={detail}
            issues={uiIssues}
            availableLabels={availableLabels}
            availableMembers={availableMembers}
            availableTeams={availableTeams}
            availableStatuses={availableStatuses}
            onProjectChange={updateProject}
            onLabelsChange={updateLabels}
            onMembersChange={updateMembers}
            onCreateMilestone={createMilestone}
            onToggleMilestone={toggleMilestone}
         />
      </div>
   );
}
