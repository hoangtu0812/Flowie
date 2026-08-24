'use client';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIssuesStore } from '@/store/issues-store';
import { Check, Plus } from 'lucide-react';
import type { ComponentProps, ComponentType } from 'react';
import { useState } from 'react';
import { toast } from 'sonner';
import { AssigneeUser } from '../assignee-user';
import { LabelBadge } from '../label-badge';
import { PrioritySelector } from '../priority-selector';
import { StatusSelector } from '../status-selector';
import { IssueRelations } from './issue-relations';

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
export function IssuePropertiesPanel({ issue, orgId }: { issue: IssueProperties; orgId: string }) {
   const cycles = useIssuesStore((state) => state.cycles);
   const workspaceLabels = useIssuesStore((state) => state.labels);
   const { addIssueLabel, removeIssueLabel } = useIssuesStore();
   const [savingLabelId, setSavingLabelId] = useState<string>();
   const cycle = issue.cycleId
      ? cycles.find((candidate) => candidate.id === issue.cycleId)
      : undefined;

   const toggleLabel = async (labelId: string) => {
      const label = workspaceLabels.find((candidate) => candidate.id === labelId);
      if (!label) return;
      setSavingLabelId(labelId);
      try {
         if (issue.labels.some((candidate) => candidate.id === label.id)) {
            await removeIssueLabel(issue.id, label.id);
         } else {
            await addIssueLabel(issue.id, label);
         }
      } catch {
         toast.error('Could not update labels');
      } finally {
         setSavingLabelId(undefined);
      }
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
               {cycle && (
                  <div className="flex items-center gap-2 mt-0.5">
                     <CyclePlayIcon className="size-4" />
                     <span className="text-sm">{cycle.name}</span>
                  </div>
               )}
            </div>
         </Section>

         <Section title="Labels">
            <div className="flex items-center flex-wrap gap-1.5">
               {issue.labels.length ? (
                  <LabelBadge label={issue.labels} />
               ) : (
                  <p className="text-sm text-muted-foreground">No labels</p>
               )}
               <Popover>
                  <PopoverTrigger asChild>
                     <button
                        type="button"
                        aria-label="Edit issue labels"
                        className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                     >
                        <Plus className="size-3.5" />
                     </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-1.5">
                     <p className="px-2 py-1 text-xs font-medium text-muted-foreground">Labels</p>
                     {workspaceLabels.length === 0 ? (
                        <p className="px-2 py-2 text-sm text-muted-foreground">
                           No labels available.
                        </p>
                     ) : (
                        <div className="max-h-56 overflow-y-auto">
                           {workspaceLabels.map((label) => {
                              const selected = issue.labels.some(
                                 (candidate) => candidate.id === label.id
                              );
                              return (
                                 <button
                                    key={label.id}
                                    type="button"
                                    disabled={savingLabelId === label.id}
                                    onClick={() => void toggleLabel(label.id)}
                                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                                 >
                                    <span
                                       className="size-2.5 rounded-full"
                                       style={{ backgroundColor: label.color }}
                                    />
                                    <span className="min-w-0 flex-1 truncate">{label.name}</span>
                                    {selected && <Check className="size-3.5" />}
                                 </button>
                              );
                           })}
                        </div>
                     )}
                  </PopoverContent>
               </Popover>
            </div>
         </Section>

         {issue.project && (
            <Section title="Project">
               <div className="flex items-center gap-2 text-sm">
                  <issue.project.icon className="size-4 text-muted-foreground shrink-0" />
                  <span className="truncate">{issue.project.name}</span>
               </div>
            </Section>
         )}

         <IssueRelations issueId={issue.id} orgId={orgId} compact />
      </div>
   );
}
