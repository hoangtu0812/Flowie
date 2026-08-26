'use client';

import { ContentBlocks } from '@/components/common/issues/details/content-blocks';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { format, parseISO } from 'date-fns';
import { ArrowRight, Check, ChevronDown, FileText, PenLine, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { DocumentOutline, getOutlineItems } from './document-outline';
import { toIssueUi, toProjectDetailUi, toProjectUi } from './project-detail-ui-adapter';
import { ProjectSidePanel } from './project-side-panel';
import { useLiveProjectData } from './use-live-project';

interface ProjectOverviewProps {
   projectId: string;
}

const formatDay = (iso?: string) => (iso ? format(parseISO(iso), 'MMM do') : '—');

/** Project "Overview" tab: description column + properties side panel. */
export default function ProjectOverview({ projectId }: ProjectOverviewProps) {
   void projectId;
   const {
      project: liveProject,
      issues: liveIssues,
      milestones,
      updates,
      activities,
      createResource,
      updateProject,
      availableLabels,
      availableInitiatives,
      updateLabels,
      updateInitiatives,
      loading,
      error,
   } = useLiveProjectData();
   const { orgId } = useParams<{ orgId: string }>();
   const scrollRef = useRef<HTMLDivElement>(null);
   const [resourceDialogOpen, setResourceDialogOpen] = useState(false);
   const [resourceLabel, setResourceLabel] = useState('');
   const [resourceUrl, setResourceUrl] = useState('');
   const [savingResource, setSavingResource] = useState(false);
   const [descriptionEditing, setDescriptionEditing] = useState(false);
   const [descriptionDraft, setDescriptionDraft] = useState('');
   const [savingDescription, setSavingDescription] = useState(false);
   const [selector, setSelector] = useState<'labels' | 'initiatives'>();
   const [selectedIds, setSelectedIds] = useState<string[]>([]);
   const [savingSelection, setSavingSelection] = useState(false);
   if (loading)
      return (
         <div className="h-full grid place-items-center text-sm text-muted-foreground">
            Loading project…
         </div>
      );
   if (error || !liveProject)
      return (
         <div className="h-full grid place-items-center text-sm text-destructive">
            {error ?? 'Project not found.'}
         </div>
      );

   const project = toProjectUi(liveProject, liveIssues);
   const detail = toProjectDetailUi(liveProject, milestones, updates, activities);
   const issues = liveIssues.map((issue) => toIssueUi(issue, project));
   const outlineItems = getOutlineItems(detail.description);
   const team = project.team;

   const submitResource = async () => {
      if (!resourceLabel.trim() || !resourceUrl.trim()) return;
      setSavingResource(true);
      try {
         await createResource(resourceLabel, resourceUrl);
         setResourceLabel('');
         setResourceUrl('');
         setResourceDialogOpen(false);
         toast.success('Resource added.');
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not add resource.');
      } finally {
         setSavingResource(false);
      }
   };

   const editDescription = () => {
      setDescriptionDraft(liveProject.description ?? '');
      setDescriptionEditing(true);
   };

   const saveDescription = async () => {
      setSavingDescription(true);
      try {
         await updateProject({ description: descriptionDraft.trim() || null });
         setDescriptionEditing(false);
         toast.success('Project description updated.');
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not update description.');
      } finally {
         setSavingDescription(false);
      }
   };

   const openSelector = (kind: 'labels' | 'initiatives') => {
      setSelector(kind);
      setSelectedIds(
         kind === 'labels'
            ? liveProject.labelLinks.map((link) => link.label.id)
            : liveProject.initiativeLinks.map((link) => link.initiative.id)
      );
   };

   const toggleSelected = (id: string) => {
      setSelectedIds((current) =>
         current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
      );
   };

   const saveSelection = async () => {
      if (!selector) return;
      setSavingSelection(true);
      try {
         if (selector === 'labels') await updateLabels(selectedIds);
         else await updateInitiatives(selectedIds);
         setSelector(undefined);
         toast.success(
            selector === 'labels' ? 'Project labels updated.' : 'Project initiatives updated.'
         );
      } catch (caught) {
         toast.error(
            caught instanceof Error ? caught.message : 'Could not update project selection.'
         );
      } finally {
         setSavingSelection(false);
      }
   };

   return (
      <div className="w-full h-full flex overflow-hidden">
         {/* Main column */}
         <div className="flex-1 min-w-0 h-full relative">
            <DocumentOutline items={outlineItems} scrollRef={scrollRef} />
            <div ref={scrollRef} className="h-full overflow-y-auto">
               <div className="max-w-3xl mx-auto px-6 lg:px-10 py-10">
                  <div className="inline-flex size-10 bg-muted/50 items-center justify-center rounded-md mb-4">
                     <project.icon className="size-6" />
                  </div>
                  <h1 className="text-3xl font-semibold tracking-tight">{project.name}</h1>
                  <p className="mt-3 text-muted-foreground leading-relaxed">{detail.summary}</p>

                  {/* Inline properties */}
                  <div className="mt-6 flex flex-col gap-2.5 text-sm">
                     <div className="flex items-center gap-3">
                        <span className="w-24 text-muted-foreground shrink-0">Properties</span>
                        <div className="flex items-center gap-3 flex-wrap">
                           <span className="inline-flex items-center gap-1.5">
                              <project.status.icon />
                              {project.status.name}
                           </span>
                           <span className="inline-flex items-center gap-1.5">
                              <project.priority.icon className="size-3.5 text-muted-foreground" />
                              {project.priority.name}
                           </span>
                           <span className="inline-flex items-center gap-1.5">
                              <Avatar className="size-4">
                                 <AvatarImage
                                    src={project.lead.avatarUrl}
                                    alt={project.lead.name}
                                 />
                                 <AvatarFallback>{project.lead.name[0]}</AvatarFallback>
                              </Avatar>
                              {project.lead.name}
                           </span>
                           <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                              {formatDay(project.startDate)}
                              <ArrowRight className="size-3" />
                              {formatDay(project.targetDate)}
                           </span>
                           {team && (
                              <span className="inline-flex items-center gap-1.5">
                                 {team.icon} {team.name}
                              </span>
                           )}
                        </div>
                     </div>

                     <div className="flex items-center gap-3">
                        <span className="w-24 text-muted-foreground shrink-0">Initiatives</span>
                        <div className="flex items-center gap-1.5 flex-wrap">
                           {liveProject.initiativeLinks.map((link) => (
                              <button
                                 key={link.initiative.id}
                                 type="button"
                                 onClick={() => openSelector('initiatives')}
                                 className="inline-flex items-center gap-1.5 text-sm hover:underline"
                              >
                                 📄 {link.initiative.name}
                              </button>
                           ))}
                           <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="Change project initiatives"
                              onClick={() => openSelector('initiatives')}
                           >
                              <Plus className="size-3.5" />
                           </button>
                        </div>
                     </div>

                     <div className="flex items-center gap-3">
                        <span className="w-24 text-muted-foreground shrink-0">Labels</span>
                        <div className="flex items-center gap-1.5">
                           {project.labels.map((label) => (
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
                           <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="Change project labels"
                              onClick={() => openSelector('labels')}
                           >
                              <Plus className="size-3.5" />
                           </button>
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
                           <button
                              type="button"
                              onClick={() => setResourceDialogOpen(true)}
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="Add resource"
                           >
                              <Plus className="size-3.5" />
                           </button>
                        </div>
                     </div>
                  </div>

                  {/* Update CTA */}
                  <Link
                     href={`/${orgId}/project/${project.id}/activity`}
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
                        <Button
                           type="button"
                           variant="ghost"
                           size="icon"
                           className="size-6"
                           aria-label="Edit project description"
                           onClick={editDescription}
                        >
                           <PenLine className="size-3.5" />
                        </Button>
                     </div>
                     {descriptionEditing ? (
                        <div className="space-y-3">
                           <textarea
                              aria-label="Project description"
                              value={descriptionDraft}
                              onChange={(event) => setDescriptionDraft(event.target.value)}
                              placeholder="Add a project description…"
                              className="border-input min-h-40 w-full rounded-md border bg-transparent px-3 py-2 text-[15px] leading-relaxed outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                              autoFocus
                           />
                           <div className="flex justify-end gap-2">
                              <Button
                                 type="button"
                                 variant="outline"
                                 disabled={savingDescription}
                                 onClick={() => setDescriptionEditing(false)}
                              >
                                 Cancel
                              </Button>
                              <Button
                                 type="button"
                                 disabled={savingDescription}
                                 onClick={() => void saveDescription()}
                              >
                                 {savingDescription ? 'Saving…' : 'Save description'}
                              </Button>
                           </div>
                        </div>
                     ) : (
                        <div className="text-[15px] leading-relaxed">
                           {detail.description.length ? (
                              <ContentBlocks blocks={detail.description} />
                           ) : (
                              <button
                                 type="button"
                                 onClick={editDescription}
                                 className="text-muted-foreground hover:text-foreground"
                              >
                                 Add a description…
                              </button>
                           )}
                        </div>
                     )}
                  </div>
               </div>
            </div>
         </div>

         {/* Side panel */}
         <ProjectSidePanel project={project} detail={detail} issues={issues} />
         <Dialog
            open={resourceDialogOpen}
            onOpenChange={(open) => !savingResource && setResourceDialogOpen(open)}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Add resource</DialogTitle>
               </DialogHeader>
               <div className="space-y-3">
                  <div className="space-y-1.5">
                     <label className="text-sm font-medium" htmlFor="project-resource-label">
                        Name
                     </label>
                     <Input
                        id="project-resource-label"
                        value={resourceLabel}
                        onChange={(event) => setResourceLabel(event.target.value)}
                        autoFocus
                     />
                  </div>
                  <div className="space-y-1.5">
                     <label className="text-sm font-medium" htmlFor="project-resource-url">
                        URL
                     </label>
                     <Input
                        id="project-resource-url"
                        type="url"
                        value={resourceUrl}
                        onChange={(event) => setResourceUrl(event.target.value)}
                        placeholder="https://"
                     />
                  </div>
               </div>
               <DialogFooter>
                  <Button
                     variant="outline"
                     disabled={savingResource}
                     onClick={() => setResourceDialogOpen(false)}
                  >
                     Cancel
                  </Button>
                  <Button
                     disabled={savingResource || !resourceLabel.trim() || !resourceUrl.trim()}
                     onClick={() => void submitResource()}
                  >
                     {savingResource ? 'Adding…' : 'Add resource'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
         <Dialog open={Boolean(selector)} onOpenChange={(open) => !open && setSelector(undefined)}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>
                     {selector === 'labels' ? 'Project labels' : 'Project initiatives'}
                  </DialogTitle>
               </DialogHeader>
               <div className="max-h-72 space-y-1 overflow-y-auto rounded-md border p-1">
                  {(selector === 'labels' ? availableLabels : availableInitiatives).map((item) => {
                     const selected = selectedIds.includes(item.id);
                     const color =
                        selector === 'labels'
                           ? (item as (typeof availableLabels)[number]).color
                           : undefined;
                     return (
                        <button
                           key={item.id}
                           type="button"
                           onClick={() => toggleSelected(item.id)}
                           className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent ${selected ? 'bg-accent' : ''}`}
                        >
                           {color ? (
                              <span
                                 className="size-2.5 rounded-full"
                                 style={{ backgroundColor: color }}
                              />
                           ) : (
                              <span>📄</span>
                           )}
                           <span className="flex-1">{item.name}</span>
                           {selected && <Check className="size-4" />}
                        </button>
                     );
                  })}
                  {selector === 'labels' && availableLabels.length === 0 && (
                     <p className="px-2 py-4 text-sm text-muted-foreground">
                        Create a Project label in Settings first.
                     </p>
                  )}
                  {selector === 'initiatives' && availableInitiatives.length === 0 && (
                     <p className="px-2 py-4 text-sm text-muted-foreground">
                        No initiatives are available in this workspace yet.
                     </p>
                  )}
               </div>
               <DialogFooter>
                  <Button
                     variant="outline"
                     disabled={savingSelection}
                     onClick={() => setSelector(undefined)}
                  >
                     Cancel
                  </Button>
                  <Button disabled={savingSelection} onClick={() => void saveSelection()}>
                     {savingSelection ? 'Saving…' : 'Save'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
