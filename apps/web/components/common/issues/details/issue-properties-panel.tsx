'use client';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { useIssuesStore } from '@/store/issues-store';
import type { ComponentProps, ComponentType } from 'react';
import { AssigneeUser } from '../assignee-user';
import { LabelBadge } from '../label-badge';
import { PrioritySelector } from '../priority-selector';
import { StatusSelector } from '../status-selector';

type IssueProperties = {
   id: string;
   status: ComponentProps<typeof StatusSelector>['status'];
   priority: ComponentProps<typeof PrioritySelector>['priority'];
   assignee: { id: string; name: string; avatarUrl?: string | null } | null;
   labels: ComponentProps<typeof LabelBadge>['label'];
   cycleId: string;
   project?: { name: string; icon: ComponentType<{ className?: string }> };
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
   return (
      <div>
         <h3 className="text-xs font-medium text-muted-foreground mb-2">{title}</h3>
         {children}
      </div>
   );
}

/** Original right-side issue properties panel using only fields returned by the Issue API. */
export function IssuePropertiesPanel({ issue }: { issue: IssueProperties }) {
   const cycles = useIssuesStore((state) => state.cycles);
   const cycle = issue.cycleId
      ? cycles.find((candidate) => candidate.id === issue.cycleId)
      : undefined;

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
               {cycle && (
                  <div className="flex items-center gap-2 mt-0.5">
                     <CyclePlayIcon className="size-4" />
                     <span className="text-sm">{cycle.name}</span>
                  </div>
               )}
            </div>
         </Section>

         <Section title="Labels">
            {issue.labels.length ? (
               <div className="flex items-center flex-wrap gap-1.5">
                  <LabelBadge label={issue.labels} />
               </div>
            ) : (
               <p className="text-sm text-muted-foreground">No labels</p>
            )}
         </Section>

         {issue.project && (
            <Section title="Project">
               <div className="flex items-center gap-2 text-sm">
                  <issue.project.icon className="size-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{issue.project.name}</span>
               </div>
            </Section>
         )}
      </div>
   );
}
