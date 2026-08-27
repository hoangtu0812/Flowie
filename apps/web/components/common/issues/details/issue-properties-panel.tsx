'use client';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IssueDetail } from '@/mock-data/issue-details';
import { Issue } from '@/mock-data/issues';
import { useIssuesStore } from '@/store/issues-store';
import {
   Ban,
   Box,
   CalendarDays,
   CalendarPlus,
   Check,
   GitPullRequestArrow,
   Plus,
} from 'lucide-react';
import { format } from 'date-fns';
import { AssigneeUser } from '../assignee-user';
import { LabelBadge } from '../label-badge';
import { PrioritySelector } from '../priority-selector';
import { StatusSelector } from '../status-selector';
import { IssueRefRow } from './content-blocks';

interface IssuePropertiesPanelProps {
   issue: Issue;
   detail: IssueDetail;
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
 */
export function IssuePropertiesPanel({ issue, detail }: IssuePropertiesPanelProps) {
   const {
      cycles,
      labels,
      projects,
      addIssueLabel,
      removeIssueLabel,
      setIssueCycle,
      updateIssueDueDate,
      updateIssueProject,
   } = useIssuesStore();
   const cycle = issue.cycleId
      ? cycles.find((candidate) => candidate.id === issue.cycleId)
      : undefined;
   const availableCycles = cycles.filter((candidate) => candidate.teamId === issue.teamId);

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
         <Section title="Properties">
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
                  <span className="text-sm">{issue.assignee ? issue.assignee.name : 'Assign'}</span>
               </div>
               {/* Created and due date sit next to each other, so each one is
                   labelled — an unlabelled date reads as either. */}
               <label className="flex items-center gap-2 mt-0.5 text-sm cursor-pointer">
                  <CalendarDays className="size-4 text-muted-foreground shrink-0" />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">Due date</span>
                  <input
                     type="date"
                     value={issue.dueDate?.slice(0, 10) ?? ''}
                     onChange={(event) =>
                        void updateIssueDueDate(issue.id, event.target.value || undefined)
                     }
                     className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none"
                  />
               </label>
               <div className="flex items-center gap-2 mt-0.5 text-sm">
                  <CalendarPlus className="size-4 text-muted-foreground shrink-0" />
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">Created</span>
                  <span className="min-w-0 flex-1 truncate">{formatDay(issue.createdAt)}</span>
               </div>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <button
                        type="button"
                        className="flex items-center gap-2 mt-0.5 -ml-1 px-1 py-0.5 rounded-md text-left hover:bg-accent/50 transition-colors"
                     >
                        <CyclePlayIcon className="size-4" />
                        <span className="text-sm">{cycle?.name ?? 'Add to cycle'}</span>
                     </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                     <DropdownMenuLabel>Cycle</DropdownMenuLabel>
                     <DropdownMenuItem onSelect={() => void setIssueCycle(issue.id, undefined)}>
                        <span className="text-muted-foreground">No cycle</span>
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
                        <DropdownMenuItem disabled>No cycles for this team</DropdownMenuItem>
                     )}
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </Section>

         <Section title="Labels">
            <div className="flex items-center flex-wrap gap-1.5">
               <LabelBadge label={issue.labels} />
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 rounded-full border"
                        aria-label="Edit labels"
                     >
                        <Plus className="size-3.5" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56">
                     <DropdownMenuLabel>Labels</DropdownMenuLabel>
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
                        <DropdownMenuItem disabled>No workspace labels yet</DropdownMenuItem>
                     )}
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </Section>

         <Section title="Project">
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
                           <span className="text-muted-foreground">Add to project</span>
                        </>
                     )}
                  </button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Project</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => void setProject(null)}>
                     <span className="text-muted-foreground">No project</span>
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
                     <DropdownMenuItem disabled>No projects in this workspace</DropdownMenuItem>
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

         {detail.blockedByIds && detail.blockedByIds.length > 0 && (
            <Section title="Blocked by">
               <div className="flex flex-col">
                  {detail.blockedByIds.map((identifier) => (
                     <div key={identifier} className="flex items-center gap-1.5 min-w-0">
                        <Ban className="size-3.5 text-red-500 shrink-0" />
                        <IssueRefRow identifier={identifier} />
                     </div>
                  ))}
               </div>
            </Section>
         )}

         {detail.relatedIds && detail.relatedIds.length > 0 && (
            <Section title="Related">
               <div className="flex flex-col">
                  {detail.relatedIds.map((identifier) => (
                     <IssueRefRow key={identifier} identifier={identifier} />
                  ))}
               </div>
            </Section>
         )}

         {detail.prLinks && detail.prLinks.length > 0 && (
            <Section title="Diffs">
               <div className="flex flex-col gap-1">
                  {detail.prLinks.map((pr) => (
                     <div key={pr.id} className="flex items-center gap-2 text-sm min-w-0">
                        <GitPullRequestArrow
                           className={
                              'size-3.5 shrink-0 ' +
                              (pr.status === 'merged' ? 'text-purple-400' : 'text-green-500')
                           }
                        />
                        <span className="text-muted-foreground shrink-0">{pr.id}</span>
                        <span className="truncate">{pr.title}</span>
                        <span className="ml-auto shrink-0 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-accent text-muted-foreground">
                           {pr.status}
                        </span>
                     </div>
                  ))}
               </div>
            </Section>
         )}
      </div>
   );
}
