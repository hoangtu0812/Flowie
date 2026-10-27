'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { IssueDetail } from '@/mock-data/issue-details';
import { Issue } from '@/mock-data/issues';
import { useIssuesStore } from '@/store/issues-store';
import {
   Box,
   CalendarDays,
   CalendarPlus,
   CalendarRange,
   Check,
   Plus,
   Timer,
} from 'lucide-react';
import { format } from 'date-fns';
import { useState } from 'react';
import { AssigneeUser } from '../assignee-user';
import { LabelBadge } from '../label-badge';
import { PrioritySelector } from '../priority-selector';
import { StatusSelector } from '../status-selector';
import type { CodeReview } from '@/lib/scm';
import { IssueDiffs } from './issue-pull-requests';
import { IssueRelations } from './issue-relations';

interface IssuePropertiesPanelProps {
   issue: Issue;
   detail: IssueDetail;
   reviews?: CodeReview[];
}

const formatDay = (value: string | undefined) => {
   const date = value ? new Date(value) : undefined;
   return date && !Number.isNaN(date.getTime()) ? format(date, 'dd/MM/yyyy') : '—';
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
   return (
      <div>
         <h3 className="text-xs font-medium text-muted-foreground mb-2">{title}</h3>
         {children}
      </div>
   );
}

/**
 * Right sidebar of the issue page: editable properties (status, priority,
 * assignee), cycle, labels, project + milestone, relations and linked PRs.
 * VI: Sidebar phải của trang issue: thuộc tính chỉnh sửa được (trạng thái, độ ưu tiên,
 * VI: người thực hiện), cycle, nhãn, dự án + milestone, quan hệ và PR liên kết.
 */
export function IssuePropertiesPanel({ issue, detail, reviews }: IssuePropertiesPanelProps) {
   const tx = useMessages(messages);

   const {
      cycles,
      labels,
      projects,
      addIssueLabel,
      removeIssueLabel,
      setIssueCycle,
      updateIssueSchedule,
      updateIssueEffort,
      updateIssueDueDate,
      updateIssueProject,
   } = useIssuesStore();
   const [scheduleOpen, setScheduleOpen] = useState(false);
   const [startDate, setStartDate] = useState('');
   const [targetDate, setTargetDate] = useState('');
   const [savingSchedule, setSavingSchedule] = useState(false);
   const [effortOpen, setEffortOpen] = useState(false);
   const [estimatedEffort, setEstimatedEffort] = useState('');
   const [actualEffort, setActualEffort] = useState('');
   const [savingEffort, setSavingEffort] = useState(false);
   const cycle = issue.cycleId
      ? cycles.find((candidate) => candidate.id === issue.cycleId)
      : undefined;
   const availableCycles = cycles.filter((candidate) => candidate.teamId === issue.teamId);

   const openSchedule = () => {
      setStartDate(issue.startDate?.slice(0, 10) ?? '');
      setTargetDate(issue.targetDate?.slice(0, 10) ?? '');
      setScheduleOpen(true);
   };

   const saveSchedule = async () => {
      setSavingSchedule(true);
      const saved = await updateIssueSchedule(issue.id, {
         startDate: startDate || undefined,
         targetDate: targetDate || undefined,
      });
      setSavingSchedule(false);
      if (saved) setScheduleOpen(false);
   };

   const openEffort = () => {
      setEstimatedEffort(issue.estimatedEffort?.toString() ?? '');
      setActualEffort(issue.actualEffort?.toString() ?? '');
      setEffortOpen(true);
   };

   const effortValue = (value: string) => {
      const parsed = Number(value);
      return value.trim() && Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
   };

   const saveEffort = async () => {
      setSavingEffort(true);
      const saved = await updateIssueEffort(issue.id, {
         estimatedEffort: effortValue(estimatedEffort),
         actualEffort: effortValue(actualEffort),
      });
      setSavingEffort(false);
      if (saved) setEffortOpen(false);
   };

   const scheduleLabel =
      issue.startDate || issue.targetDate
         ? `${formatDay(issue.startDate)} → ${formatDay(issue.targetDate)}`
         : tx('Set start and target dates');

   const setProject = async (projectId: string | null) => {
      await updateIssueProject(
         issue.id,
         projectId ? projects.find((candidate) => candidate.id === projectId) : undefined
      );
   };

   const toggleLabel = async (labelId: string) => {
      const label = labels.find((candidate) => candidate.id === labelId);
      if (!label) return;
      if (issue.labels.some((candidate) => candidate.id === labelId)) {
         await removeIssueLabel(issue.id, labelId);
         return;
      }
      await addIssueLabel(issue.id, label);
   };

   return (
      <div className="flex flex-col gap-7">
         <Section title={tx('Properties')}>
            <div className="flex flex-col gap-1.5">
               <div className="flex items-center gap-1.5 -ml-1.5">
                  <StatusSelector status={issue.status} issueId={issue.id} />
                  <span className="text-sm">{issue.status.name}</span>
               </div>
               <div className="flex items-center gap-1.5 -ml-1.5">
                  <PrioritySelector priority={issue.priority} issueId={issue.id} />
                  <span className="text-sm">{issue.priority.name}</span>
               </div>
               <div className="flex items-center gap-2 mt-0.5">
                  <AssigneeUser user={issue.assignee} issueId={issue.id} />
                  <span className="text-sm">
                     {issue.assignee ? issue.assignee.name : tx('Assign')}
                  </span>
               </div>
               <button
                  type="button"
                  onClick={openSchedule}
                  className="flex items-center gap-2 mt-0.5 -ml-1 px-1 py-0.5 rounded-md text-left hover:bg-accent/50 transition-colors"
               >
                  <CalendarRange className="size-4 text-muted-foreground shrink-0" />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                     {tx('Schedule')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{scheduleLabel}</span>
               </button>
               <Popover>
                  <PopoverTrigger asChild>
                     <button
                        type="button"
                        className="flex items-center gap-2 mt-0.5 -ml-1 px-1 py-0.5 rounded-md text-left hover:bg-accent/50 transition-colors"
                     >
                        <CalendarDays className="size-4 text-muted-foreground shrink-0" />
                        <span className="w-20 shrink-0 text-xs text-muted-foreground">
                           {tx('Due date')}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm">
                           {formatDay(issue.dueDate)}
                        </span>
                     </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 space-y-2">
                     <p className="text-sm font-medium">{tx('Due date')}</p>
                     <Input
                        type="date"
                        value={issue.dueDate?.slice(0, 10) ?? ''}
                        onChange={(event) =>
                           void updateIssueDueDate(issue.id, event.target.value || undefined)
                        }
                     />
                     <p className="text-xs text-muted-foreground">
                        {tx('Clear the field to remove the due date.')}
                     </p>
                  </PopoverContent>
               </Popover>
               <button
                  type="button"
                  onClick={openEffort}
                  className="flex items-center gap-2 mt-0.5 -ml-1 px-1 py-0.5 rounded-md text-left hover:bg-accent/50 transition-colors"
               >
                  <Timer className="size-4 text-muted-foreground shrink-0" />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                     {tx('Effort')}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                     {tx('Est')} {issue.estimatedEffort ?? '—'} {tx('· Act')}{' '}
                     {issue.actualEffort ?? '—'} {tx('mandays')}
                  </span>
               </button>
               <div className="flex items-center gap-2 mt-0.5 text-sm">
                  <CalendarPlus className="size-4 text-muted-foreground shrink-0" />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                     {tx('Created')}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{formatDay(issue.createdAt)}</span>
               </div>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <button
                        type="button"
                        className="flex items-center gap-2 mt-0.5 -ml-1 px-1 py-0.5 rounded-md text-left hover:bg-accent/50 transition-colors"
                     >
                        <CyclePlayIcon className="size-4" />
                        <span className="text-sm">{cycle?.name ?? tx('Add to cycle')}</span>
                     </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                     <DropdownMenuLabel>{tx('Cycle')}</DropdownMenuLabel>
                     <DropdownMenuItem onSelect={() => void setIssueCycle(issue.id, undefined)}>
                        <span className="text-muted-foreground">{tx('No cycle')}</span>
                        {!issue.cycleId && <Check className="ml-auto size-4" />}
                     </DropdownMenuItem>
                     {availableCycles.map((candidate) => (
                        <DropdownMenuItem
                           key={candidate.id}
                           onSelect={() => void setIssueCycle(issue.id, candidate.id)}
                        >
                           <CyclePlayIcon className="size-4 text-muted-foreground" />
                           <span className="truncate">{candidate.name}</span>
                           {issue.cycleId === candidate.id && <Check className="ml-auto size-4" />}
                        </DropdownMenuItem>
                     ))}
                     {availableCycles.length === 0 && (
                        <DropdownMenuItem disabled>
                           {tx('No cycles for this team')}
                        </DropdownMenuItem>
                     )}
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </Section>

         <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>{tx('Set issue dates')}</DialogTitle>
               </DialogHeader>
               <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-sm font-medium">
                     {tx('Start date')}
                     <Input
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                     />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium">
                     {tx('Target end date')}
                     <Input
                        type="date"
                        value={targetDate}
                        onChange={(event) => setTargetDate(event.target.value)}
                     />
                  </label>
               </div>
               <DialogFooter>
                  <Button
                     variant="outline"
                     onClick={() => setScheduleOpen(false)}
                     disabled={savingSchedule}
                  >
                     {tx('Cancel')}
                  </Button>
                  <Button onClick={() => void saveSchedule()} disabled={savingSchedule}>
                     {savingSchedule ? tx('Saving…') : tx('Save')}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <Dialog open={effortOpen} onOpenChange={setEffortOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>{tx('Set issue effort')}</DialogTitle>
               </DialogHeader>
               <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1.5 text-sm font-medium">
                     {tx('Est effort (mandays)')}
                     <Input
                        type="number"
                        min="0"
                        step="0.25"
                        value={estimatedEffort}
                        onChange={(event) => setEstimatedEffort(event.target.value)}
                     />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium">
                     {tx('Act effort (mandays)')}
                     <Input
                        type="number"
                        min="0"
                        step="0.25"
                        value={actualEffort}
                        onChange={(event) => setActualEffort(event.target.value)}
                     />
                  </label>
               </div>
               <DialogFooter>
                  <Button
                     variant="outline"
                     onClick={() => setEffortOpen(false)}
                     disabled={savingEffort}
                  >
                     {tx('Cancel')}
                  </Button>
                  <Button onClick={() => void saveEffort()} disabled={savingEffort}>
                     {savingEffort ? tx('Saving…') : tx('Save')}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <Section title={tx('Labels')}>
            <div className="flex items-center flex-wrap gap-1.5">
               <LabelBadge label={issue.labels} />
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 rounded-full border"
                        aria-label={tx('Edit labels')}
                     >
                        <Plus className="size-3.5" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                     <DropdownMenuLabel>{tx('Labels')}</DropdownMenuLabel>
                     {labels.map((label) => (
                        <DropdownMenuItem
                           key={label.id}
                           onSelect={(event) => {
                              // Keep the menu open so several labels can be toggled
                              // in one pass, the way the context menu behaves.
                              event.preventDefault();
                              void toggleLabel(label.id);
                           }}
                        >
                           <span
                              className="inline-block size-3 rounded-full"
                              style={{ backgroundColor: label.color }}
                              aria-hidden="true"
                           />
                           <span className="truncate">{label.name}</span>
                           {issue.labels.some((candidate) => candidate.id === label.id) && (
                              <Check className="ml-auto size-4 shrink-0" />
                           )}
                        </DropdownMenuItem>
                     ))}
                     {labels.length === 0 && (
                        <DropdownMenuItem disabled>
                           {tx('No workspace labels yet')}
                        </DropdownMenuItem>
                     )}
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </Section>

         <Section title={tx('Project')}>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <button
                     type="button"
                     className="flex items-center gap-2 text-sm w-full text-left rounded-md -mx-1 px-1 py-0.5 hover:bg-accent/50 transition-colors"
                  >
                     {issue.project ? (
                        <>
                           <issue.project.icon className="size-4 text-muted-foreground shrink-0" />
                           <span className="truncate">{issue.project.name}</span>
                        </>
                     ) : (
                        <>
                           <Box className="size-4 text-muted-foreground shrink-0" />
                           <span className="text-muted-foreground">{tx('Add to project')}</span>
                        </>
                     )}
                  </button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>{tx('Project')}</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => void setProject(null)}>
                     <span className="text-muted-foreground">{tx('No project')}</span>
                     {!issue.project && <Check className="ml-auto size-4 shrink-0" />}
                  </DropdownMenuItem>
                  {projects.map((project) => (
                     <DropdownMenuItem
                        key={project.id}
                        onSelect={() => void setProject(project.id)}
                     >
                        <Box className="size-4 text-muted-foreground shrink-0" />
                        <span className="truncate">{project.name}</span>
                        {issue.project?.id === project.id && (
                           <Check className="ml-auto size-4 shrink-0" />
                        )}
                     </DropdownMenuItem>
                  ))}
                  {projects.length === 0 && (
                     <DropdownMenuItem disabled>
                        {tx('No projects in this workspace')}
                     </DropdownMenuItem>
                  )}
               </DropdownMenuContent>
            </DropdownMenu>
            {issue.project && detail.milestone && (
               <div className="flex items-center gap-2 text-sm mt-1.5 pl-6 text-muted-foreground">
                  <span className="size-2 rotate-45 border border-amber-400 shrink-0" />
                  <span className="truncate">{detail.milestone}</span>
               </div>
            )}
         </Section>

         <IssueRelations issueId={issue.id} />

         {reviews && (
            <Section title={tx('Diffs')}>
               <IssueDiffs reviews={reviews} identifier={issue.identifier} />
            </Section>
         )}
      </div>
   );
}
