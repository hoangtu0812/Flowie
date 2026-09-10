'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { priorities } from '@/lib/priority-presentations';
import { toProjectDetailUi, toProjectUi } from './details/project-detail-ui-adapter';
import { useLiveProject } from './details/use-live-project';
import { format, parseISO } from 'date-fns';
import {
   ArrowRight,
   Calendar,
   CalendarPlus,
   Check,
   ChevronRight,
   Compass,
   Plus,
   Slack,
   Star,
   Tag,
   UserPlus,
   X,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ProjectProgressChart } from './details/project-progress-chart';

interface ProjectPeekPanelProps {
   projectId: string;
   onClose: () => void;
}

const formatDay = (iso?: string) => (iso ? format(parseISO(iso), 'MMM do') : '—');

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
   return (
      <div className="flex items-center gap-4 min-h-8">
         <span className="text-sm text-muted-foreground w-24 shrink-0">{label}</span>
         <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1">{children}</div>
      </div>
   );
}

function PeekEditor({
   title,
   open,
   onOpenChange,
   trigger,
   children,
}: {
   title: string;
   open: boolean;
   onOpenChange: (open: boolean) => void;
   trigger: React.ReactNode;
   children: React.ReactNode;
}) {
   return (
      <Popover open={open} onOpenChange={onOpenChange}>
         <PopoverTrigger asChild>
            <button
               type="button"
               title={title}
               className="min-w-0 flex items-center gap-1.5 rounded px-1 -mx-1 py-0.5 hover:bg-accent transition-colors text-left"
            >
               {trigger}
            </button>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-64 p-1.5">
            {children}
         </PopoverContent>
      </Popover>
   );
}

function EditorOption({
   selected,
   onSelect,
   children,
}: {
   selected: boolean;
   onSelect: () => void;
   children: React.ReactNode;
}) {
   return (
      <button
         type="button"
         onClick={onSelect}
         className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent transition-colors text-left"
      >
         <span className="min-w-0 flex-1 truncate">{children}</span>
         {selected && <Check className="size-4 shrink-0" />}
      </button>
   );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
   return (
      <div className={`rounded-xl border bg-container shadow-lg p-4 ${className ?? ''}`}>
         {children}
      </div>
   );
}

/**
 * Floating panel opened in place when a project bar is clicked on the
 * timeline (Linear-style "peek"): header, properties, milestones and
 * progress cards stacked over the right side of the timeline.
 */
export function ProjectPeekPanel({ projectId, onClose }: ProjectPeekPanelProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const {
      project: liveProject,
      issues,
      milestones,
      updates,
      activities,
      availableStatuses,
      availableMembers,
      availableLabels,
      updateProject,
      updateLabels,
      updateMembers,
   } = useLiveProject(projectId);
   const [openEditor, setOpenEditor] = useState<string | null>(null);
   const [saving, setSaving] = useState(false);
   const [startDate, setStartDate] = useState('');
   const [targetDate, setTargetDate] = useState('');
   const project = useMemo(
      () => (liveProject ? toProjectUi(liveProject, issues) : undefined),
      [issues, liveProject]
   );
   const detail = useMemo(
      () =>
         liveProject ? toProjectDetailUi(liveProject, milestones, updates, activities) : undefined,
      [activities, liveProject, milestones, updates]
   );

   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [onClose]);

   const members = useMemo(
      () => liveProject?.members.map((member) => member.user) ?? [],
      [liveProject]
   );
   const memberIds = useMemo(() => members.map((member) => member.id), [members]);
   const labelIds = useMemo(
      () => liveProject?.labelLinks.map((link) => link.label.id) ?? [],
      [liveProject]
   );

   const run = async (work: () => Promise<unknown>) => {
      setSaving(true);
      try {
         await work();
         setOpenEditor(null);
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not save project changes.');
      } finally {
         setSaving(false);
      }
   };

   const editorProps = (key: string) => ({
      open: openEditor === key && !saving,
      onOpenChange: (open: boolean) => {
         if (open && key === 'dates') {
            setStartDate(liveProject?.startDate?.slice(0, 10) ?? '');
            setTargetDate(liveProject?.targetDate?.slice(0, 10) ?? '');
         }
         setOpenEditor(open ? key : null);
      },
   });

   const toggleId = (id: string, current: string[]) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id];

   if (!project || !detail) return null;

   const team = project.team;
   const started = issues.filter((issue) => issue.status.category === 'started').length;
   const completed = issues.filter((issue) => issue.status.category === 'completed').length;

   return (
      <aside className="absolute top-10 right-2 bottom-2 w-[400px] max-w-[calc(100%-1rem)] z-40 flex flex-col gap-2 overflow-y-auto">
         {/* Header */}
         <Card className="flex items-center gap-2 py-3">
            <span className="inline-flex size-6 bg-muted/50 items-center justify-center rounded shrink-0">
               <project.icon className="size-3.5" />
            </span>
            <Link
               href={`/${orgId}/project/${project.id}/overview`}
               className="flex-1 min-w-0 flex items-center gap-1.5 group"
               aria-label="Open project"
            >
               <span className="font-medium truncate group-hover:text-foreground/80 transition-colors">
                  {project.name}
               </span>
               <ChevronRight className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
            </Link>
            <button className="text-muted-foreground hover:text-foreground transition-colors shrink-0">
               <Star className="size-4" />
            </button>
            <button
               onClick={onClose}
               className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
               aria-label="Close panel"
            >
               <X className="size-4" />
            </button>
         </Card>

         {/* Properties */}
         <Card>
            <div className="flex items-center justify-between mb-1.5">
               <h3 className="text-sm font-medium">Properties</h3>
               <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Plus className="size-3.5" />
               </button>
            </div>
            <div className="flex flex-col">
               <PropertyRow label="Status">
                  <PeekEditor
                     title="Change status"
                     {...editorProps('status')}
                     trigger={
                        <>
                           <project.status.icon />
                           <span className="truncate">{project.status.name}</span>
                        </>
                     }
                  >
                     {availableStatuses.map((status) => (
                        <EditorOption
                           key={status.id}
                           selected={status.name === liveProject?.status}
                           onSelect={() => void run(() => updateProject({ status: status.name }))}
                        >
                           <span className="inline-flex items-center gap-2">
                              <span
                                 className="size-2.5 rounded-full"
                                 style={{ backgroundColor: status.color }}
                              />
                              {status.name}
                           </span>
                        </EditorOption>
                     ))}
                     {availableStatuses.length === 0 && (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">
                           No statuses available.
                        </p>
                     )}
                  </PeekEditor>
               </PropertyRow>
               <PropertyRow label="Priority">
                  <PeekEditor
                     title="Change priority"
                     {...editorProps('priority')}
                     trigger={
                        <>
                           <project.priority.icon className="size-3.5 text-muted-foreground" />
                           <span className="truncate">{project.priority.name}</span>
                        </>
                     }
                  >
                     {priorities.map((priority) => (
                        <EditorOption
                           key={priority.id}
                           selected={priority.id === project.priority.id}
                           onSelect={() => void run(() => updateProject({ priority: priority.id }))}
                        >
                           <span className="inline-flex items-center gap-2">
                              <priority.icon className="size-3.5 text-muted-foreground" />
                              {priority.name}
                           </span>
                        </EditorOption>
                     ))}
                  </PeekEditor>
               </PropertyRow>
               <PropertyRow label="Lead">
                  <PeekEditor
                     title="Change lead"
                     {...editorProps('lead')}
                     trigger={
                        <>
                           <Avatar className="size-5">
                              <AvatarImage src={project.lead.avatarUrl} alt={project.lead.name} />
                              <AvatarFallback>{project.lead.name[0]}</AvatarFallback>
                           </Avatar>
                           <span className="truncate max-w-40">{project.lead.name}</span>
                        </>
                     }
                  >
                     <EditorOption
                        selected={!liveProject?.lead}
                        onSelect={() => void run(() => updateProject({ leadId: null }))}
                     >
                        <span className="text-muted-foreground">No lead</span>
                     </EditorOption>
                     {availableMembers.map((member) => (
                        <EditorOption
                           key={member.user.id}
                           selected={member.user.id === liveProject?.lead?.id}
                           onSelect={() =>
                              void run(() => updateProject({ leadId: member.user.id }))
                           }
                        >
                           <span className="inline-flex items-center gap-2">
                              <Avatar className="size-5">
                                 <AvatarImage
                                    src={member.user.avatarUrl ?? undefined}
                                    alt={member.user.name}
                                 />
                                 <AvatarFallback>{member.user.name[0]}</AvatarFallback>
                              </Avatar>
                              {member.user.name}
                           </span>
                        </EditorOption>
                     ))}
                  </PeekEditor>
               </PropertyRow>
               <PropertyRow label="Members">
                  <PeekEditor
                     title="Edit members"
                     {...editorProps('members')}
                     trigger={
                        members.length > 0 ? (
                           <span className="inline-flex items-center gap-1.5">
                              <span className="flex -space-x-1.5">
                                 {members.slice(0, 3).map((member) => (
                                    <Avatar
                                       key={member.id}
                                       className="size-5 border-2 border-container"
                                    >
                                       <AvatarImage
                                          src={member.avatarUrl ?? undefined}
                                          alt={member.name}
                                       />
                                       <AvatarFallback>{member.name[0]}</AvatarFallback>
                                    </Avatar>
                                 ))}
                              </span>
                              {members.length} {members.length === 1 ? 'member' : 'members'}
                           </span>
                        ) : (
                           <span className="flex items-center gap-1.5 text-muted-foreground">
                              <UserPlus className="size-3.5" />
                              Add members
                           </span>
                        )
                     }
                  >
                     {availableMembers.map((member) => (
                        <EditorOption
                           key={member.user.id}
                           selected={memberIds.includes(member.user.id)}
                           onSelect={() =>
                              void run(() => updateMembers(toggleId(member.user.id, memberIds)))
                           }
                        >
                           <span className="inline-flex items-center gap-2">
                              <Avatar className="size-5">
                                 <AvatarImage
                                    src={member.user.avatarUrl ?? undefined}
                                    alt={member.user.name}
                                 />
                                 <AvatarFallback>{member.user.name[0]}</AvatarFallback>
                              </Avatar>
                              {member.user.name}
                           </span>
                        </EditorOption>
                     ))}
                     {availableMembers.length === 0 && (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">
                           No workspace members available.
                        </p>
                     )}
                  </PeekEditor>
               </PropertyRow>
               <PropertyRow label="Dates">
                  <PeekEditor
                     title="Change dates"
                     {...editorProps('dates')}
                     trigger={
                        <>
                           <span className="inline-flex items-center gap-1">
                              <Calendar className="size-3.5 text-muted-foreground" />
                              {formatDay(project.startDate)}
                           </span>
                           <ArrowRight className="size-3 text-muted-foreground" />
                           <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <CalendarPlus className="size-3.5" />
                              {project.targetDate ? (
                                 <span className="text-foreground">
                                    {formatDay(project.targetDate)}
                                 </span>
                              ) : (
                                 'Target'
                              )}
                           </span>
                        </>
                     }
                  >
                     <div className="p-1 space-y-2" onClick={(event) => event.stopPropagation()}>
                        <label className="block text-xs font-medium text-muted-foreground">
                           Start date
                           <Input
                              type="date"
                              className="mt-1"
                              value={startDate}
                              onChange={(event) => setStartDate(event.target.value)}
                           />
                        </label>
                        <label className="block text-xs font-medium text-muted-foreground">
                           Target date
                           <Input
                              type="date"
                              className="mt-1"
                              value={targetDate}
                              onChange={(event) => setTargetDate(event.target.value)}
                           />
                        </label>
                        <button
                           type="button"
                           disabled={saving}
                           onClick={() =>
                              void run(() =>
                                 updateProject({
                                    startDate: startDate || null,
                                    targetDate: targetDate || null,
                                 })
                              )
                           }
                           className="w-full rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-60"
                        >
                           {saving ? 'Saving…' : 'Save dates'}
                        </button>
                     </div>
                  </PeekEditor>
               </PropertyRow>
               <PropertyRow label="Teams">
                  <span className="inline-flex items-center gap-1.5">
                     {team?.icon} {team?.name ?? project.teamId}
                  </span>
               </PropertyRow>
               <PropertyRow label="Slack">
                  <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                     <Slack className="size-3.5" />
                     Connect channel
                  </button>
               </PropertyRow>
               <PropertyRow label="Initiatives">
                  {project.initiative ? (
                     <span className="truncate max-w-44">{project.initiative}</span>
                  ) : (
                     <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Compass className="size-3.5" />
                        No initiative
                     </span>
                  )}
               </PropertyRow>
               <PropertyRow label="Labels">
                  <PeekEditor
                     title="Edit labels"
                     {...editorProps('labels')}
                     trigger={
                        <span className="flex items-center gap-1.5 min-w-0">
                           {project.labels.length === 0 && (
                              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                 <Tag className="size-3.5" />
                                 Add label
                              </span>
                           )}
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
                              </span>
                           ))}
                        </span>
                     }
                  >
                     {availableLabels.map((label) => (
                        <EditorOption
                           key={label.id}
                           selected={labelIds.includes(label.id)}
                           onSelect={() =>
                              void run(() => updateLabels(toggleId(label.id, labelIds)))
                           }
                        >
                           <span className="inline-flex items-center gap-2">
                              <span
                                 className="size-2.5 rounded-full"
                                 style={{ backgroundColor: label.color }}
                              />
                              {label.name}
                           </span>
                        </EditorOption>
                     ))}
                     {availableLabels.length === 0 && (
                        <p className="px-2 py-1.5 text-sm text-muted-foreground">
                           No workspace labels yet.
                        </p>
                     )}
                  </PeekEditor>
               </PropertyRow>
            </div>
         </Card>

         {/* Milestones */}
         <Card>
            <div className="flex items-center justify-between mb-2">
               <h3 className="text-sm font-medium">Milestones</h3>
               <button className="text-muted-foreground hover:text-foreground transition-colors">
                  <Plus className="size-3.5" />
               </button>
            </div>
            {detail.milestones.length === 0 ? (
               <p className="text-xs text-muted-foreground">
                  Add milestones to organize work within your project and break it into more
                  granular stages. <span className="text-foreground/70 underline">Learn more</span>
               </p>
            ) : (
               <div className="flex flex-col gap-1.5">
                  {detail.milestones.map((milestone) => (
                     <div
                        key={milestone.id}
                        className="flex items-center justify-between gap-2 text-sm"
                     >
                        <span
                           className={
                              milestone.completed
                                 ? 'line-through text-muted-foreground truncate'
                                 : 'truncate'
                           }
                        >
                           {milestone.name}
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                           {formatDay(milestone.targetDate)}
                        </span>
                     </div>
                  ))}
               </div>
            )}
         </Card>

         {/* Progress */}
         <Card>
            <h3 className="text-sm font-medium mb-3">Progress</h3>
            <div className="grid grid-cols-3 gap-2 mb-2">
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="size-2 rounded-[2px] bg-[#8f9299]" />
                     Scope
                  </div>
                  <span className="text-sm font-medium">{issues.length}</span>
               </div>
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="size-2 rounded-[2px] bg-[#facc15]" />
                     Started
                  </div>
                  <span className="text-sm font-medium">{started}</span>
               </div>
               <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                     <span className="size-2 rounded-[2px] bg-[#6771c5]" />
                     Completed
                  </div>
                  <span className="text-sm font-medium">{completed}</span>
               </div>
            </div>
            <ProjectProgressChart
               startDate={project.startDate}
               endDate={project.targetDate ?? project.startDate}
               scope={issues.length}
               started={started}
               completed={completed}
            />
         </Card>
      </aside>
   );
}
