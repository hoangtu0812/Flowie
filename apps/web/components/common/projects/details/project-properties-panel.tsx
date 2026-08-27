'use client';

import { CapacityRing } from '@/components/common/cycles/capacity-ring';
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
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PanelFilterTarget, usePanelFilter } from '@/components/common/issues/use-panel-filter';
import { priorities } from '@/lib/priority-presentations';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ProjectProgressChart } from './project-progress-chart';
import {
   projectStatusPresentation,
   type ProjectDetailUiIssue,
   type ProjectDetailUiProject,
} from './project-detail-ui-adapter';
import type { ProjectDetail } from '@/types/project-details';
import { ArrowRight, Calendar, Check, Compass, Plus, Slack, Tag, UserPlus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type LiveProjectCustomField, useLiveProjectData } from './use-live-project';

interface ProjectPropertiesPanelProps {
   project: ProjectDetailUiProject;
   detail: ProjectDetail;
   issues: ProjectDetailUiIssue[];
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

type Editor =
   | 'status'
   | 'priority'
   | 'lead'
   | 'members'
   | 'dates'
   | 'team'
   | 'initiatives'
   | 'labels'
   | 'custom-field'
   | 'milestone'
   | null;

function customFieldText(field: LiveProjectCustomField) {
   if (field.value === null || field.value === undefined || field.value === '') return 'Set value';
   if (Array.isArray(field.value)) return field.value.join(', ') || 'Set value';
   if (field.type === 'BOOLEAN') return field.value ? 'Yes' : 'No';
   if (field.type === 'DATE' && typeof field.value === 'string') return formatDay(field.value);
   return String(field.value);
}

/**
 * Right-side panel of the project pages: properties, milestones,
 * progress breakdowns and a compact activity feed.
 */
export function ProjectPropertiesPanel({ project, detail, issues }: ProjectPropertiesPanelProps) {
   const panelFilter = usePanelFilter();
   const { orgId } = useParams<{ orgId: string }>();
   const {
      availableLabels,
      availableInitiatives,
      availableStatuses,
      customFields,
      availableMembers,
      availableTeams,
      updateProject,
      updateLabels,
      updateInitiatives,
      updateMembers,
      updateCustomFields,
      createMilestone,
      toggleMilestone,
   } = useLiveProjectData();
   const [editor, setEditor] = useState<Editor>(null);
   const [saving, setSaving] = useState(false);
   const [status, setStatus] = useState(project.status.id);
   const [priority, setPriority] = useState(project.priority.id);
   const [leadId, setLeadId] = useState(project.lead.id === 'unassigned' ? '' : project.lead.id);
   const [memberIds, setMemberIds] = useState<string[]>(
      project.members.map((member) => member.user.id)
   );
   const [startDate, setStartDate] = useState(project.persistedStartDate?.slice(0, 10) ?? '');
   const [targetDate, setTargetDate] = useState(project.targetDate?.slice(0, 10) ?? '');
   const [teamId, setTeamId] = useState(project.team?.id ?? '');
   const [initiativeIds, setInitiativeIds] = useState(
      project.initiatives.map((link) => link.initiative.id)
   );
   const [labelIds, setLabelIds] = useState(project.labels.map((label) => label.id));
   const [milestoneTitle, setMilestoneTitle] = useState('');
   const [milestoneDate, setMilestoneDate] = useState('');
   const [customFieldId, setCustomFieldId] = useState<string>();
   const [customValue, setCustomValue] = useState<unknown>(null);
   const completed = issues.filter(isCompleted).length;

   const openEditor = (next: Exclude<Editor, null>) => {
      if (next === 'status') setStatus(project.status.id);
      if (next === 'priority') setPriority(project.priority.id);
      if (next === 'lead') setLeadId(project.lead.id === 'unassigned' ? '' : project.lead.id);
      if (next === 'members') setMemberIds(project.members.map((member) => member.user.id));
      if (next === 'dates') {
         setStartDate(project.persistedStartDate?.slice(0, 10) ?? '');
         setTargetDate(project.targetDate?.slice(0, 10) ?? '');
      }
      if (next === 'team') setTeamId(project.team?.id ?? '');
      if (next === 'initiatives') {
         setInitiativeIds(project.initiatives.map((link) => link.initiative.id));
      }
      if (next === 'labels') setLabelIds(project.labels.map((label) => label.id));
      if (next === 'milestone') {
         setMilestoneTitle('');
         setMilestoneDate('');
      }
      setEditor(next);
   };

   const openCustomField = (field: LiveProjectCustomField) => {
      setCustomFieldId(field.id);
      setCustomValue(field.value ?? (field.type === 'MULTI_SELECT' ? [] : ''));
      setEditor('custom-field');
   };

   const selectedCustomField = customFields.find((field) => field.id === customFieldId);

   const toggleSelection = (
      value: string,
      current: string[],
      setCurrent: (next: string[]) => void
   ) => {
      setCurrent(
         current.includes(value) ? current.filter((item) => item !== value) : [...current, value]
      );
   };

   const save = async () => {
      if (!editor) return;
      setSaving(true);
      try {
         if (editor === 'status') await updateProject({ status });
         if (editor === 'priority') await updateProject({ priority });
         if (editor === 'lead')
            await updateProject({ leadId: leadId === 'unassigned' ? null : leadId || null });
         if (editor === 'members') await updateMembers(memberIds);
         if (editor === 'dates')
            await updateProject({ startDate: startDate || null, targetDate: targetDate || null });
         if (editor === 'team')
            await updateProject({ teamId: teamId === 'unassigned' ? null : teamId || null });
         if (editor === 'initiatives') await updateInitiatives(initiativeIds);
         if (editor === 'labels') await updateLabels(labelIds);
         if (editor === 'custom-field') {
            if (!selectedCustomField) throw new Error('Custom field is not available.');
            let value = customValue;
            if (selectedCustomField.type === 'NUMBER' && typeof value === 'string') {
               value = value.trim() ? Number(value) : null;
            }
            if (
               ['TEXT', 'URL', 'DATE'].includes(selectedCustomField.type) &&
               typeof value === 'string' &&
               !value.trim()
            ) {
               value = null;
            }
            await updateCustomFields({ [selectedCustomField.id]: value });
         }
         if (editor === 'milestone') {
            if (!milestoneTitle.trim()) throw new Error('Milestone name is required.');
            await createMilestone(milestoneTitle, milestoneDate || undefined);
         }
         setEditor(null);
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not save project changes.');
      } finally {
         setSaving(false);
      }
   };

   const team = project.team;

   const started = issues.filter((issue) => issue.status.category === 'started').length;

   const members = useMemo(() => {
      const seen = new Set<string>();
      return issues
         .map((issue) => issue.assignee)
         .filter((assignee): assignee is NonNullable<typeof assignee> => {
            if (!assignee || seen.has(assignee.id)) return false;
            seen.add(assignee.id);
            return true;
         });
   }, [issues]);

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
                                src={sample.assignee.avatarUrl}
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
      <div className="contents">
         <div className="flex flex-col h-full w-full overflow-y-auto">
            {/* Properties */}
            <div className="px-5 pt-4 pb-4 border-b">
               <h3 className="text-sm font-medium mb-2.5">Properties</h3>
               <div className="flex flex-col gap-1">
                  <PropertyRow label="Status">
                     <button
                        type="button"
                        onClick={() => openEditor('status')}
                        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                     >
                        <project.status.icon />
                        <span>{project.status.name}</span>
                     </button>
                  </PropertyRow>
                  <PropertyRow label="Priority">
                     <button
                        type="button"
                        onClick={() => openEditor('priority')}
                        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                     >
                        <project.priority.icon className="size-3.5 text-muted-foreground" />
                        <span>{project.priority.name}</span>
                     </button>
                  </PropertyRow>
                  <PropertyRow label="Lead">
                     <button
                        type="button"
                        onClick={() => openEditor('lead')}
                        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                     >
                        <Avatar className="size-5">
                           <AvatarImage src={project.lead.avatarUrl} alt={project.lead.name} />
                           <AvatarFallback>{project.lead.name[0]}</AvatarFallback>
                        </Avatar>
                        <span className="truncate max-w-36">{project.lead.name}</span>
                     </button>
                  </PropertyRow>
                  <PropertyRow label="Members">
                     <button
                        type="button"
                        onClick={() => openEditor('members')}
                        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                     >
                        {members.length > 0 ? (
                           <>
                              <span className="flex -space-x-1.5">
                                 {members.slice(0, 3).map((member) => (
                                    <Avatar
                                       key={member.id}
                                       className="size-5 border-2 border-container"
                                    >
                                       <AvatarImage src={member.avatarUrl} alt={member.name} />
                                       <AvatarFallback>{member.name[0]}</AvatarFallback>
                                    </Avatar>
                                 ))}
                              </span>
                              {members.length} {members.length === 1 ? 'member' : 'members'}
                           </>
                        ) : (
                           <>
                              <UserPlus className="size-3.5" />
                              Add members
                           </>
                        )}
                     </button>
                  </PropertyRow>
                  <PropertyRow label="Dates">
                     <button
                        type="button"
                        onClick={() => openEditor('dates')}
                        className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                     >
                        <span className="inline-flex items-center gap-1">
                           <Calendar className="size-3.5 text-muted-foreground" />
                           {formatDay(project.startDate)}
                        </span>
                        <ArrowRight className="size-3 text-muted-foreground" />
                        <span className="inline-flex items-center gap-1">
                           <Calendar className="size-3.5 text-muted-foreground" />
                           {project.targetDate ? formatDay(project.targetDate) : 'Target'}
                        </span>
                     </button>
                  </PropertyRow>
                  <PropertyRow label="Teams">
                     <button
                        type="button"
                        onClick={() => openEditor('team')}
                        className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                     >
                        {team?.icon} {team?.name ?? project.teamId}
                     </button>
                  </PropertyRow>
                  <PropertyRow label="Slack">
                     <button className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                        <Slack className="size-3.5" />
                        Connect channel
                     </button>
                  </PropertyRow>
                  <PropertyRow label="Initiatives">
                     <button
                        type="button"
                        onClick={() => openEditor('initiatives')}
                        className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
                     >
                        {project.initiatives.length > 0 ? (
                           <span className="truncate max-w-44">
                              {project.initiatives.map((link) => link.initiative.name).join(', ')}
                           </span>
                        ) : (
                           <>
                              <Compass className="size-3.5" />
                              No initiative
                           </>
                        )}
                     </button>
                  </PropertyRow>
                  <PropertyRow label="Labels">
                     <button
                        type="button"
                        onClick={() => openEditor('labels')}
                        className="flex items-center gap-1.5 hover:text-foreground transition-colors"
                     >
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
                        <Plus className="size-3.5 text-muted-foreground" />
                     </button>
                  </PropertyRow>
                  {customFields.map((field) => (
                     <PropertyRow key={field.id} label={field.name}>
                        <button
                           type="button"
                           onClick={() => openCustomField(field)}
                           className="inline-flex max-w-44 truncate text-muted-foreground hover:text-foreground transition-colors"
                        >
                           {customFieldText(field)}
                        </button>
                     </PropertyRow>
                  ))}
               </div>
            </div>

            {/* Milestones */}
            <div className="px-5 py-4 border-b">
               <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium">Milestones</h3>
                  <button
                     type="button"
                     onClick={() => openEditor('milestone')}
                     className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                     <Plus className="size-3.5" />
                  </button>
               </div>
               {detail.milestones.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                     Add milestones to organize work within your project and break it into more
                     granular stages.{' '}
                     <span className="text-foreground/70 underline">Learn more</span>
                  </p>
               ) : (
                  <div className="flex flex-col gap-1.5">
                     {detail.milestones.map((milestone) => (
                        <button
                           type="button"
                           onClick={() =>
                              void toggleMilestone(milestone.id, !milestone.completed).catch(
                                 (caught) =>
                                    toast.error(
                                       caught instanceof Error
                                          ? caught.message
                                          : 'Could not update milestone.'
                                    )
                              )
                           }
                           key={milestone.id}
                           className="flex items-center justify-between gap-2 text-sm text-left hover:text-foreground transition-colors"
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
                           <AvatarImage src={event.user.avatarUrl} alt={event.user.name} />
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
         <Dialog
            open={editor !== null}
            onOpenChange={(open) => !saving && !open && setEditor(null)}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>
                     {editor === 'status'
                        ? 'Set project status'
                        : editor === 'priority'
                          ? 'Set project priority'
                          : editor === 'lead'
                            ? 'Set project lead'
                            : editor === 'members'
                              ? 'Manage project members'
                              : editor === 'dates'
                                ? 'Set project dates'
                                : editor === 'team'
                                  ? 'Set project team'
                                  : editor === 'initiatives'
                                    ? 'Link initiatives'
                                    : editor === 'labels'
                                      ? 'Manage project labels'
                                      : editor === 'custom-field'
                                        ? selectedCustomField?.name
                                        : 'Create milestone'}
                  </DialogTitle>
               </DialogHeader>
               {editor === 'status' && (
                  <Select value={status} onValueChange={setStatus}>
                     <SelectTrigger>
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {availableStatuses.map((option) => {
                           const presentation = projectStatusPresentation(
                              option.name,
                              option.category
                           );
                           return (
                              <SelectItem key={option.id} value={option.name}>
                                 <presentation.icon />
                                 {presentation.name}
                              </SelectItem>
                           );
                        })}
                     </SelectContent>
                  </Select>
               )}
               {editor === 'priority' && (
                  <Select value={priority} onValueChange={setPriority}>
                     <SelectTrigger>
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        {priorities.map((option) => (
                           <SelectItem key={option.id} value={option.id}>
                              <option.icon className="size-4" />
                              {option.name}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               )}
               {editor === 'lead' && (
                  <Select value={leadId} onValueChange={setLeadId}>
                     <SelectTrigger>
                        <SelectValue placeholder="No lead" />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="unassigned">
                           <UserPlus className="size-4" />
                           No lead
                        </SelectItem>
                        {availableMembers.map((member) => (
                           <SelectItem key={member.userId} value={member.userId}>
                              <Avatar className="size-5">
                                 <AvatarImage
                                    src={member.user.avatarUrl ?? undefined}
                                    alt={member.user.name}
                                 />
                                 <AvatarFallback>{member.user.name[0]}</AvatarFallback>
                              </Avatar>
                              {member.user.name}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               )}
               {editor === 'members' && (
                  <div className="max-h-72 overflow-y-auto space-y-1">
                     {availableMembers.map((member) => {
                        const selected = memberIds.includes(member.userId);
                        return (
                           <button
                              key={member.userId}
                              type="button"
                              onClick={() =>
                                 toggleSelection(member.userId, memberIds, setMemberIds)
                              }
                              className={cn(
                                 'w-full flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent',
                                 selected && 'bg-accent'
                              )}
                           >
                              <Avatar className="size-5">
                                 <AvatarImage
                                    src={member.user.avatarUrl ?? undefined}
                                    alt={member.user.name}
                                 />
                                 <AvatarFallback>{member.user.name[0]}</AvatarFallback>
                              </Avatar>
                              <span className="flex-1 text-sm">{member.user.name}</span>
                              {selected && <Check className="size-4" />}
                           </button>
                        );
                     })}
                  </div>
               )}
               {editor === 'dates' && (
                  <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="project-start-date">
                           Start date
                        </label>
                        <Input
                           id="project-start-date"
                           type="date"
                           value={startDate}
                           onChange={(event) => setStartDate(event.target.value)}
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="project-target-date">
                           Target date
                        </label>
                        <Input
                           id="project-target-date"
                           type="date"
                           value={targetDate}
                           onChange={(event) => setTargetDate(event.target.value)}
                        />
                     </div>
                  </div>
               )}
               {editor === 'team' && (
                  <Select value={teamId} onValueChange={setTeamId}>
                     <SelectTrigger>
                        <SelectValue placeholder="No team" />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="unassigned">No team</SelectItem>
                        {availableTeams.map((option) => (
                           <SelectItem key={option.id} value={option.id}>
                              <span className="text-sm">{option.icon}</span>
                              {option.name}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               )}
               {editor === 'initiatives' && (
                  <div className="max-h-72 overflow-y-auto space-y-1">
                     {availableInitiatives.map((initiative) => {
                        const selected = initiativeIds.includes(initiative.id);
                        return (
                           <button
                              key={initiative.id}
                              type="button"
                              onClick={() =>
                                 toggleSelection(initiative.id, initiativeIds, setInitiativeIds)
                              }
                              className={cn(
                                 'w-full flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent',
                                 selected && 'bg-accent'
                              )}
                           >
                              <span className="flex-1 text-sm">{initiative.name}</span>
                              {selected && <Check className="size-4" />}
                           </button>
                        );
                     })}
                  </div>
               )}
               {editor === 'labels' && (
                  <div className="max-h-72 overflow-y-auto space-y-1">
                     {availableLabels.map((label) => {
                        const selected = labelIds.includes(label.id);
                        return (
                           <button
                              key={label.id}
                              type="button"
                              onClick={() => toggleSelection(label.id, labelIds, setLabelIds)}
                              className={cn(
                                 'w-full flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent',
                                 selected && 'bg-accent'
                              )}
                           >
                              <span
                                 className="size-2.5 rounded-full"
                                 style={{ backgroundColor: label.color }}
                              />
                              <span className="flex-1 text-sm">{label.name}</span>
                              {selected && <Check className="size-4" />}
                           </button>
                        );
                     })}
                     {availableLabels.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                           Create a Project label in Settings first.
                        </p>
                     )}
                  </div>
               )}
               {editor === 'custom-field' && selectedCustomField && (
                  <div className="space-y-2">
                     {selectedCustomField.description && (
                        <p className="text-sm text-muted-foreground">
                           {selectedCustomField.description}
                        </p>
                     )}
                     {['TEXT', 'URL', 'DATE', 'NUMBER'].includes(selectedCustomField.type) && (
                        <Input
                           type={
                              selectedCustomField.type === 'DATE'
                                 ? 'date'
                                 : selectedCustomField.type === 'NUMBER'
                                   ? 'number'
                                   : selectedCustomField.type === 'URL'
                                     ? 'url'
                                     : 'text'
                           }
                           value={
                              typeof customValue === 'string' || typeof customValue === 'number'
                                 ? String(customValue)
                                 : ''
                           }
                           onChange={(event) => setCustomValue(event.target.value)}
                           autoFocus
                        />
                     )}
                     {selectedCustomField.type === 'BOOLEAN' && (
                        <Select
                           value={
                              customValue === true
                                 ? 'true'
                                 : customValue === false
                                   ? 'false'
                                   : 'unset'
                           }
                           onValueChange={(value) =>
                              setCustomValue(value === 'unset' ? null : value === 'true')
                           }
                        >
                           <SelectTrigger>
                              <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value="unset">Not set</SelectItem>
                              <SelectItem value="true">Yes</SelectItem>
                              <SelectItem value="false">No</SelectItem>
                           </SelectContent>
                        </Select>
                     )}
                     {selectedCustomField.type === 'SELECT' && (
                        <Select
                           value={
                              typeof customValue === 'string' && customValue ? customValue : 'unset'
                           }
                           onValueChange={(value) =>
                              setCustomValue(value === 'unset' ? null : value)
                           }
                        >
                           <SelectTrigger>
                              <SelectValue placeholder="Select an option" />
                           </SelectTrigger>
                           <SelectContent>
                              <SelectItem value="unset">Not set</SelectItem>
                              {(selectedCustomField.options ?? []).map((option) => (
                                 <SelectItem key={option} value={option}>
                                    {option}
                                 </SelectItem>
                              ))}
                           </SelectContent>
                        </Select>
                     )}
                     {selectedCustomField.type === 'MULTI_SELECT' && (
                        <div className="max-h-64 overflow-y-auto space-y-1">
                           {(selectedCustomField.options ?? []).map((option) => {
                              const values = Array.isArray(customValue)
                                 ? customValue.map((item) => String(item))
                                 : [];
                              const selected = values.includes(option);
                              return (
                                 <button
                                    key={option}
                                    type="button"
                                    onClick={() =>
                                       setCustomValue(
                                          selected
                                             ? values.filter((item) => item !== option)
                                             : [...values, option]
                                       )
                                    }
                                    className={cn(
                                       'w-full flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-accent',
                                       selected && 'bg-accent'
                                    )}
                                 >
                                    <span className="flex-1 text-sm">{option}</span>
                                    {selected && <Check className="size-4" />}
                                 </button>
                              );
                           })}
                        </div>
                     )}
                  </div>
               )}
               {editor === 'milestone' && (
                  <div className="space-y-3">
                     <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="project-milestone-title">
                           Name
                        </label>
                        <Input
                           id="project-milestone-title"
                           value={milestoneTitle}
                           onChange={(event) => setMilestoneTitle(event.target.value)}
                           autoFocus
                        />
                     </div>
                     <div className="space-y-1.5">
                        <label className="text-sm font-medium" htmlFor="project-milestone-date">
                           Target date
                        </label>
                        <Input
                           id="project-milestone-date"
                           type="date"
                           value={milestoneDate}
                           onChange={(event) => setMilestoneDate(event.target.value)}
                        />
                     </div>
                  </div>
               )}
               <DialogFooter>
                  <Button variant="outline" disabled={saving} onClick={() => setEditor(null)}>
                     Cancel
                  </Button>
                  <Button
                     disabled={saving || (editor === 'milestone' && !milestoneTitle.trim())}
                     onClick={() => void save()}
                  >
                     {saving ? 'Saving…' : editor === 'milestone' ? 'Create milestone' : 'Save'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
