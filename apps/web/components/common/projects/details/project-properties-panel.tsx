'use client';

import { CapacityRing } from '@/components/common/cycles/capacity-ring';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { ProjectDetail } from '@/mock-data/project-details';
import { PanelFilterTarget, usePanelFilter } from '@/components/common/issues/use-panel-filter';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ProjectProgressChart } from './project-progress-chart';
import { ArrowRight, Check, Compass, MessageCircle, Plus, Tag } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ProjectLabelSelector } from '../project-label-selector';
import type {
   LiveProjectLabel,
   LiveProjectStatus,
   LiveWorkspaceMember,
   LiveWorkspaceTeam,
} from './use-live-project';
import type { ProjectDetailUiIssue, ProjectDetailUiProject } from './project-detail-ui-adapter';
import { ProjectMemberSelector } from '../project-member-selector';
import { ProjectDateDialog } from './project-date-dialog';

interface ProjectPropertiesPanelProps {
   project: ProjectDetailUiProject;
   detail: ProjectDetail;
   issues: ProjectDetailUiIssue[];
   availableLabels: LiveProjectLabel[];
   availableMembers: LiveWorkspaceMember[];
   availableTeams: LiveWorkspaceTeam[];
   availableStatuses: LiveProjectStatus[];
   onProjectChange: (data: Record<string, unknown>) => Promise<unknown>;
   onLabelsChange?: (labelIds: string[]) => Promise<void>;
   onMembersChange: (userIds: string[]) => Promise<void>;
   onCreateMilestone?: (title: string, targetDate?: string) => Promise<unknown>;
   onToggleMilestone?: (milestoneId: string, completed: boolean) => Promise<void>;
}

const isCompleted = (issue: ProjectDetailUiIssue) => issue.status.category === 'completed';

const formatDay = (iso?: string) => (iso ? format(parseISO(iso), 'MMM do') : '—');

interface BreakdownRow {
   key: string;
   label: string;
   leading: React.ReactNode;
   total: number;
   completedPercent: number;
   /** Click-to-filter target (exclusive, like the insights panel rows). */
   target?: PanelFilterTarget;
}

function buildRows<T>(
   issues: ProjectDetailUiIssue[],
   keyOf: (issue: ProjectDetailUiIssue) => T | undefined,
   describe: (
      key: T,
      sample: ProjectDetailUiIssue
   ) => Omit<BreakdownRow, 'total' | 'completedPercent'>
): BreakdownRow[] {
   const buckets = new Map<T, ProjectDetailUiIssue[]>();
   for (const issue of issues) {
      const key = keyOf(issue);
      if (key === undefined) continue;
      buckets.set(key, [...(buckets.get(key) ?? []), issue]);
   }
   return [...buckets.entries()]
      .map(([key, bucket]) => ({
         ...describe(key, bucket[0]),
         total: bucket.length,
         completedPercent: Math.round((bucket.filter(isCompleted).length / bucket.length) * 100),
      }))
      .sort((a, b) => b.total - a.total);
}

function BreakdownList({
   rows,
   panelFilter,
}: {
   rows: BreakdownRow[];
   panelFilter: ReturnType<typeof usePanelFilter>;
}) {
   if (rows.length === 0) {
      return <p className="text-xs text-muted-foreground px-1 py-3">Nothing to show yet.</p>;
   }
   return (
      <div className="flex flex-col">
         {rows.map((row) => {
            const active = row.target ? panelFilter.isActive(row.target) : false;
            return (
               <button
                  key={row.key}
                  type="button"
                  onClick={() => row.target && panelFilter.toggle(row.target)}
                  className={cn(
                     'flex items-center justify-between gap-3 py-2 px-1.5 -mx-1.5 rounded-md text-left transition-colors',
                     row.target && 'cursor-pointer hover:bg-accent/50',
                     active && 'bg-accent hover:bg-accent'
                  )}
               >
                  <div className="flex items-center gap-2 min-w-0">
                     {row.leading}
                     <span className="text-sm truncate">{row.label}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-sm text-muted-foreground">
                     <CapacityRing value={row.completedPercent} color="#6771c5" />
                     <span className="whitespace-nowrap">
                        {row.completedPercent}% of {row.total}
                     </span>
                  </div>
               </button>
            );
         })}
      </div>
   );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
   return (
      <div className="flex items-center justify-between gap-4 min-h-7">
         <span className="text-sm text-muted-foreground shrink-0">{label}</span>
         <div className="flex items-center gap-1.5 text-sm min-w-0">{children}</div>
      </div>
   );
}

function MilestoneDialog({
   onCreate,
}: {
   onCreate?: (title: string, targetDate?: string) => Promise<unknown>;
}) {
   const [open, setOpen] = useState(false);
   const [title, setTitle] = useState('');
   const [targetDate, setTargetDate] = useState('');
   const [saving, setSaving] = useState(false);
   const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!onCreate || !title.trim()) return;
      setSaving(true);
      try {
         await onCreate(title.trim(), targetDate || undefined);
         setTitle('');
         setTargetDate('');
         setOpen(false);
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not create milestone.');
      } finally {
         setSaving(false);
      }
   };
   return (
      <Dialog open={open} onOpenChange={setOpen}>
         <button
            type="button"
            aria-label="Add milestone"
            disabled={!onCreate}
            onClick={() => setOpen(true)}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
         >
            <Plus className="size-3.5" />
         </button>
         <DialogContent>
            <DialogHeader>
               <DialogTitle>New milestone</DialogTitle>
            </DialogHeader>
            <form className="space-y-4" onSubmit={submit}>
               <div className="space-y-2">
                  <Label htmlFor="milestone-title">Title</Label>
                  <Input
                     id="milestone-title"
                     value={title}
                     onChange={(event) => setTitle(event.target.value)}
                     autoFocus
                     required
                  />
               </div>
               <div className="space-y-2">
                  <Label htmlFor="milestone-date">Target date</Label>
                  <Input
                     id="milestone-date"
                     type="date"
                     value={targetDate}
                     onChange={(event) => setTargetDate(event.target.value)}
                  />
               </div>
               <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                     Cancel
                  </Button>
                  <Button type="submit" disabled={saving || !title.trim()}>
                     {saving ? 'Creating…' : 'Create milestone'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}

/**
 * Right-side panel of the project pages: properties, milestones,
 * progress breakdowns and a compact activity feed.
 */
export function ProjectPropertiesPanel({
   project,
   detail,
   issues,
   availableLabels,
   availableMembers,
   availableTeams,
   availableStatuses,
   onProjectChange,
   onLabelsChange,
   onMembersChange,
   onCreateMilestone,
   onToggleMilestone,
}: ProjectPropertiesPanelProps) {
   const panelFilter = usePanelFilter();
   const { orgId } = useParams<{ orgId: string }>();
   const completed = issues.filter(isCompleted).length;

   const team = project.team;

   const started = issues.filter((issue) => issue.status.category === 'started').length;
   const mutate = (data: Record<string, unknown>) =>
      onProjectChange(data).catch((caught) => {
         toast.error(caught instanceof Error ? caught.message : 'Could not update project.');
      });

   const assigneeRows = useMemo(
      () =>
         buildRows(
            issues,
            (issue) => issue.assignee?.id ?? 'no-assignee',
            (key, sample) =>
               sample.assignee
                  ? {
                       key: String(key),
                       label: sample.assignee.name,
                       leading: (
                          <Avatar className="size-5 shrink-0">
                             <AvatarImage
                                src={sample.assignee.avatarUrl || undefined}
                                alt={sample.assignee.name}
                             />
                             <AvatarFallback>{sample.assignee.name[0]}</AvatarFallback>
                          </Avatar>
                       ),
                       target: { columnId: 'assignee', value: sample.assignee.id },
                    }
                  : {
                       key: 'no-assignee',
                       label: 'No assignee',
                       leading: null,
                       target: { columnId: 'assignee', value: 'unassigned' },
                    }
         ),
      [issues]
   );

   const labelRows = useMemo(
      () =>
         buildRows(
            issues,
            (issue) => issue.labels[0]?.id,
            (key, sample) => ({
               key: String(key),
               label: sample.labels[0]?.name ?? 'Unlabeled',
               leading: (
                  <span
                     className="size-2.5 rounded-full shrink-0"
                     style={{ backgroundColor: sample.labels[0]?.color ?? 'gray' }}
                  />
               ),
               target: { columnId: 'labels', value: String(key) },
            })
         ),
      [issues]
   );

   const cycleRows = useMemo(
      () =>
         buildRows(
            issues,
            (issue) => (issue.cycleId === '' ? undefined : issue.cycleId),
            (key, sample) => ({
               key: String(key),
               label: sample.cycleName ?? `Cycle ${key}`,
               leading: null,
               target: { columnId: 'cycle', value: String(key) },
            })
         ),
      [issues]
   );

   return (
      <div className="flex flex-col h-full w-full overflow-y-auto">
         {/* Properties */}
         <div className="px-5 pt-4 pb-4 border-b">
            <h3 className="text-sm font-medium mb-2.5">Properties</h3>
            <div className="flex flex-col gap-1">
               <PropertyRow label="Status">
                  <Select
                     value={project.status.id}
                     onValueChange={(status) => void mutate({ status })}
                  >
                     <SelectTrigger className="h-auto w-40 border-0 bg-transparent p-0 shadow-none">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {availableStatuses.map((status) => (
                           <SelectItem key={status.id} value={status.name}>
                              {status.name
                                 .replaceAll('-', ' ')
                                 .replace(/\b\w/g, (character) => character.toUpperCase())}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </PropertyRow>
               <PropertyRow label="Priority">
                  <Select
                     value={project.priority.id}
                     onValueChange={(priority) =>
                        void mutate({ priority: priority === 'no-priority' ? 'none' : priority })
                     }
                  >
                     <SelectTrigger className="h-auto w-40 border-0 bg-transparent p-0 shadow-none">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {['no-priority', 'urgent', 'high', 'medium', 'low'].map((priority) => (
                           <SelectItem key={priority} value={priority}>
                              {priority === 'no-priority'
                                 ? 'No priority'
                                 : priority[0].toUpperCase() + priority.slice(1)}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </PropertyRow>
               <PropertyRow label="Lead">
                  <Select
                     value={project.lead.id}
                     onValueChange={(leadId) =>
                        void mutate({ leadId: leadId === 'unassigned' ? null : leadId })
                     }
                  >
                     <SelectTrigger className="h-auto w-40 border-0 bg-transparent p-0 shadow-none">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {availableMembers.map((member) => (
                           <SelectItem key={member.user.id} value={member.user.id}>
                              {member.user.name}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </PropertyRow>
               <PropertyRow label="Members">
                  <ProjectMemberSelector
                     members={project.members}
                     availableMembers={availableMembers}
                     onMembersChange={onMembersChange}
                  />
               </PropertyRow>
               <PropertyRow label="Dates">
                  <ProjectDateDialog
                     value={project.persistedStartDate}
                     title="Project start date"
                     fallback="Start"
                     onSave={(startDate) => onProjectChange({ startDate })}
                  />
                  <ArrowRight className="size-3 text-muted-foreground" />
                  <ProjectDateDialog
                     value={project.targetDate}
                     title="Project target date"
                     fallback="Target"
                     onSave={(targetDate) => onProjectChange({ targetDate })}
                  />
               </PropertyRow>
               <PropertyRow label="Teams">
                  <Select
                     value={team?.id ?? 'no-team'}
                     onValueChange={(teamId) =>
                        void mutate({ teamId: teamId === 'no-team' ? null : teamId })
                     }
                  >
                     <SelectTrigger className="h-auto w-40 border-0 bg-transparent p-0 shadow-none">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="no-team">No team</SelectItem>
                        {availableTeams.map((option) => (
                           <SelectItem key={option.id} value={option.id}>
                              {option.icon ?? '👥'} {option.name}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </PropertyRow>
               <PropertyRow label="Discord">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                     <MessageCircle className="size-3.5" />
                     Workspace notifications
                  </span>
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
                  <div className="flex items-center gap-1.5">
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
                     <ProjectLabelSelector
                        labels={project.labels}
                        availableLabels={availableLabels}
                        disabled={!onLabelsChange}
                        onLabelsChange={onLabelsChange}
                     />
                  </div>
               </PropertyRow>
            </div>
         </div>

         {/* Milestones */}
         <div className="px-5 py-4 border-b">
            <div className="flex items-center justify-between mb-2">
               <h3 className="text-sm font-medium">Milestones</h3>
               <MilestoneDialog onCreate={onCreateMilestone} />
            </div>
            {detail.milestones.length === 0 ? (
               <p className="text-xs text-muted-foreground">
                  Add milestones to organize work within your project and break it into more
                  granular stages. <span className="text-foreground/70 underline">Learn more</span>
               </p>
            ) : (
               <div className="flex flex-col gap-1.5">
                  {detail.milestones.map((milestone) => (
                     <button
                        type="button"
                        key={milestone.id}
                        disabled={!onToggleMilestone}
                        onClick={() =>
                           void onToggleMilestone?.(milestone.id, !milestone.completed).catch(
                              (caught) =>
                                 toast.error(
                                    caught instanceof Error
                                       ? caught.message
                                       : 'Could not update milestone.'
                                 )
                           )
                        }
                        className="w-full flex items-center justify-between gap-2 text-sm text-left rounded hover:bg-accent/40 disabled:hover:bg-transparent"
                     >
                        <span className="flex items-center gap-2 min-w-0">
                           <span
                              className={
                                 milestone.completed
                                    ? 'size-4 rounded-full bg-violet-500 flex items-center justify-center shrink-0'
                                    : 'size-4 rounded-full border border-muted-foreground/40 shrink-0'
                              }
                           >
                              {milestone.completed && <Check className="size-2.5 text-white" />}
                           </span>
                           <span
                              className={
                                 milestone.completed
                                    ? 'truncate line-through text-muted-foreground'
                                    : 'truncate'
                              }
                           >
                              {milestone.name}
                           </span>
                        </span>
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                           {formatDay(milestone.targetDate)}
                        </span>
                     </button>
                  ))}
               </div>
            )}
         </div>

         {/* Progress */}
         <div className="px-5 py-4 border-b">
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
            <div className="mb-3">
               <ProjectProgressChart
                  startDate={project.startDate}
                  endDate={project.targetDate ?? project.startDate}
                  scope={issues.length}
                  started={started}
                  completed={completed}
               />
            </div>
            <Tabs defaultValue="assignees">
               <TabsList className="h-8 bg-transparent gap-1 p-0">
                  <TabsTrigger value="assignees" className="text-xs px-2.5 rounded-full">
                     Assignees
                  </TabsTrigger>
                  <TabsTrigger value="labels" className="text-xs px-2.5 rounded-full">
                     Labels
                  </TabsTrigger>
                  <TabsTrigger value="cycles" className="text-xs px-2.5 rounded-full">
                     Cycles
                  </TabsTrigger>
               </TabsList>
               <TabsContent value="assignees">
                  <BreakdownList rows={assigneeRows} panelFilter={panelFilter} />
               </TabsContent>
               <TabsContent value="labels">
                  <BreakdownList rows={labelRows} panelFilter={panelFilter} />
               </TabsContent>
               <TabsContent value="cycles">
                  <BreakdownList rows={cycleRows} panelFilter={panelFilter} />
               </TabsContent>
            </Tabs>
         </div>

         {/* Activity */}
         <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
               <h3 className="text-sm font-medium">Activity</h3>
               <Link
                  href={`/${orgId}/project/${project.id}/activity`}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
               >
                  See all
               </Link>
            </div>
            <div className="flex flex-col gap-3">
               {detail.activity.map((event) => (
                  <div key={event.id} className="flex items-start gap-2 text-xs">
                     <Avatar className="size-4 mt-0.5 shrink-0">
                        <AvatarImage
                           src={event.user.avatarUrl || undefined}
                           alt={event.user.name}
                        />
                        <AvatarFallback>{event.user.name[0]}</AvatarFallback>
                     </Avatar>
                     <p className="text-muted-foreground leading-relaxed">
                        <span className="text-foreground">{event.user.name}</span> {event.text} ·{' '}
                        {formatDay(event.date)}
                     </p>
                  </div>
               ))}
            </div>
         </div>
      </div>
   );
}
