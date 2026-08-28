'use client';

import { cn } from '@/lib/utils';
import { Issue } from '@/mock-data/issues';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { useIssuesStore } from '@/store/issues-store';
import { format } from 'date-fns';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AssigneeUser } from './assignee-user';
import { ISSUE_COLUMN, issueListMinWidth } from './issue-columns';
import { LabelBadge } from './label-badge';
import { PrioritySelector } from './priority-selector';
import { ProjectBadge } from './project-badge';
import { StatusSelector } from './status-selector';
import { motion } from 'motion/react';

import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { IssueContextMenu } from './issue-context-menu';

const formatScheduleDate = (value: string | undefined) =>
   value ? format(new Date(value), 'MMM dd') : '—';

export function IssueLine({ issue, layoutId = false }: { issue: Issue; layoutId?: boolean }) {
   const { orgId } = useParams<{ orgId: string }>();
   const { displayProperties } = useDisplaySettingsStore();
   const { cycles } = useIssuesStore();
   const cycle =
      displayProperties.cycle && issue.cycleId
         ? cycles.find((candidate) => candidate.id === issue.cycleId)
         : undefined;

   return (
      <ContextMenu>
         <ContextMenuTrigger asChild>
            <motion.div
               {...(layoutId && { layoutId: `issue-line-${issue.identifier}` })}
               className="flex items-center justify-start h-11 px-6 hover:bg-sidebar/50"
               style={{ minWidth: issueListMinWidth(displayProperties) }}
            >
               <div className="flex items-center gap-0.5">
                  {displayProperties.priority && (
                     <PrioritySelector priority={issue.priority} issueId={issue.id} />
                  )}
                  {displayProperties.id && (
                     <span className="text-sm hidden sm:inline-block text-muted-foreground font-medium w-[66px] truncate shrink-0 mr-0.5">
                        {issue.identifier}
                     </span>
                  )}
                  {displayProperties.status && (
                     <StatusSelector status={issue.status} issueId={issue.id} />
                  )}
               </div>
               <Link
                  href={`/${orgId ?? 'lndev-ui'}/issue/${issue.identifier}`}
                  className="flex-1 min-w-0 flex items-center justify-start mr-1 ml-0.5"
               >
                  <span className="text-xs sm:text-sm font-medium sm:font-semibold truncate">
                     {issue.title}
                  </span>
               </Link>
               {/* Fixed columns from here on: they carry the labels printed by
                   IssuesListHeader, so every cell renders even when empty. */}
               {displayProperties.labels && (
                  <div className={ISSUE_COLUMN.labels}>
                     <LabelBadge label={issue.labels.slice(0, 1)} />
                     {issue.labels.length > 1 && (
                        <span className="text-xs text-muted-foreground shrink-0">
                           +{issue.labels.length - 1}
                        </span>
                     )}
                  </div>
               )}
               {displayProperties.project && (
                  <div className={ISSUE_COLUMN.project}>
                     {issue.project && <ProjectBadge project={issue.project} />}
                  </div>
               )}
               {displayProperties.startDate && (
                  <div className={cn(ISSUE_COLUMN.startDate, 'text-xs text-muted-foreground')}>
                     {formatScheduleDate(issue.startDate)}
                  </div>
               )}
               {displayProperties.targetDate && (
                  <div className={cn(ISSUE_COLUMN.targetDate, 'text-xs text-muted-foreground')}>
                     {formatScheduleDate(issue.targetDate)}
                  </div>
               )}
               {displayProperties.estimatedEffort && (
                  <div
                     className={cn(ISSUE_COLUMN.estimatedEffort, 'text-xs text-muted-foreground')}
                  >
                     {issue.estimatedEffort ?? '—'}
                  </div>
               )}
               {displayProperties.actualEffort && (
                  <div className={cn(ISSUE_COLUMN.actualEffort, 'text-xs text-muted-foreground')}>
                     {issue.actualEffort ?? '—'}
                  </div>
               )}
               {displayProperties.cycle && (
                  <div className={cn(ISSUE_COLUMN.cycle, 'text-xs text-muted-foreground')}>
                     <span className="truncate">{cycle?.name ?? '—'}</span>
                  </div>
               )}
               {displayProperties.created && (
                  <div className={cn(ISSUE_COLUMN.created, 'text-xs text-muted-foreground')}>
                     {format(new Date(issue.createdAt), 'MMM dd')}
                  </div>
               )}
               {displayProperties.dueDate && (
                  <div className={cn(ISSUE_COLUMN.dueDate, 'text-xs')}>
                     {issue.dueDate ? (
                        <span className="text-orange-400">
                           {format(new Date(issue.dueDate), 'MMM dd')}
                        </span>
                     ) : (
                        <span className="text-muted-foreground">—</span>
                     )}
                  </div>
               )}
               {displayProperties.assignee && (
                  <div className={ISSUE_COLUMN.assignee}>
                     <AssigneeUser user={issue.assignee} issueId={issue.id} />
                  </div>
               )}
            </motion.div>
         </ContextMenuTrigger>
         <IssueContextMenu issueId={issue.id} />
      </ContextMenu>
   );
}
