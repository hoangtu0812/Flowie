'use client';

import { Issue } from '@/types/issues';
import { useIssuesStore } from '@/store/issues-store';
import { format } from 'date-fns';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { isProjectPath, issueHref } from '@/lib/issue-route';
import { AssigneeUser } from './assignee-user';
import {
   ISSUE_COLUMN,
   issueListMinWidth,
   useIssueColumns,
   type IssueColumnKey,
} from './issue-columns';
import { IssueDateCell, IssueEffortCell } from './issue-inline-cells';
import { FittedChips } from './fitted-chips';
import { LabelBadge } from './label-badge';
import { SubProjectBadge } from './sub-project-badge';
import { otherSubProjects } from './sub-project-groups';
import { MilestoneBadge } from './milestone-badge';
import { PrioritySelector } from './priority-selector';
import { ProjectBadge } from './project-badge';
import { StatusSelector } from './status-selector';
import { motion } from 'motion/react';
import { HStack } from '@astryxdesign/core/Layout';
import { IssueSubtaskPopover } from './issue-subtask-popover';
import { IssueParentIndicator } from './issue-parent-indicator';

import { ContextMenu, ContextMenuTrigger } from '@/components/ui/context-menu';
import { IssueContextMenu } from './issue-context-menu';

/**
 * One issue row of the list. `subProjectGroupId` is the sub project of the group the row is
 * listed in when grouping by sub project; that one is left out of the Sub projects cell.
 * VI: Một dòng issue của danh sách. `subProjectGroupId` là sub project của nhóm chứa dòng khi
 * VI: group theo sub project; sub project đó không hiện trong ô Sub projects.
 */
export function IssueLine({
   issue,
   layoutId = false,
   subProjectGroupId,
}: {
   issue: Issue;
   layoutId?: boolean;
   subProjectGroupId?: string;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const pathname = usePathname();
   const columns = useIssueColumns();
   const { visible: displayProperties, order, widths } = columns;
   const { cycles } = useIssuesStore();
   const cycle =
      displayProperties.cycle && issue.cycleId
         ? cycles.find((candidate) => candidate.id === issue.cycleId)
         : undefined;

   const cell = (key: IssueColumnKey) => {
      switch (key) {
         case 'labels':
            return (
               <FittedChips items={issue.labels} render={(shown) => <LabelBadge label={shown} />} />
            );
         case 'subProjects':
            return (
               <FittedChips
                  items={otherSubProjects(issue.subProjectLabels ?? [], subProjectGroupId)}
                  render={(shown) => <SubProjectBadge labels={shown} />}
               />
            );
         case 'milestone':
            return issue.milestone && <MilestoneBadge milestone={issue.milestone} />;
         case 'project':
            return issue.project && <ProjectBadge project={issue.project} />;
         case 'startDate':
            return <IssueDateCell issueId={issue.id} value={issue.startDate} kind="start" />;
         case 'targetDate':
            return <IssueDateCell issueId={issue.id} value={issue.targetDate} kind="target" />;
         case 'estimatedEffort':
            return (
               <IssueEffortCell issueId={issue.id} value={issue.estimatedEffort} kind="estimated" />
            );
         case 'actualEffort':
            return <IssueEffortCell issueId={issue.id} value={issue.actualEffort} kind="actual" />;
         case 'cycle':
            return (
               <span className="truncate text-xs text-muted-foreground">{cycle?.name ?? '—'}</span>
            );
         case 'created':
            return (
               <span className="text-xs text-muted-foreground">
                  {format(new Date(issue.createdAt), 'MMM dd')}
               </span>
            );
         case 'dueDate':
            return <IssueDateCell issueId={issue.id} value={issue.dueDate} kind="due" accent />;
         case 'assignee':
            return <AssigneeUser user={issue.assignee} issueId={issue.id} teamId={issue.teamId} />;
      }
   };

   return (
      <ContextMenu>
         <ContextMenuTrigger asChild>
            <motion.div
               {...(layoutId && { layoutId: `issue-line-${issue.identifier}` })}
               className="flex items-center justify-start h-11 px-6 hover:bg-sidebar/50"
               style={{ minWidth: issueListMinWidth(columns) }}
            >
               {/* The title column: prefix controls and title share one block whose
                   minimum width is the account's title width, matching the header.
                   VI: Cột Title: các control đầu dòng và tiêu đề nằm chung một khối có
                   độ rộng tối thiểu bằng độ rộng Title của tài khoản, khớp với header. */}
               <div className="flex items-center min-w-0" style={{ flex: `1 0 ${widths.title}px` }}>
                  <div className="flex items-center gap-0.5">
                     {displayProperties.priority && (
                        <PrioritySelector priority={issue.priority} issueId={issue.id} />
                     )}
                     {displayProperties.id && (
                        <span className="text-sm hidden sm:inline-block text-muted-foreground font-medium w-[66px] truncate shrink-0 mr-0.5">
                           {issue.identifier}
                        </span>
                     )}
                     <IssueParentIndicator parent={issue.parent} />
                     {displayProperties.status && (
                        <StatusSelector status={issue.status} issueId={issue.id} />
                     )}
                  </div>
                  <HStack gap={2} className="flex-1 min-w-0 mr-1 ml-0.5">
                     <Link
                        href={issueHref(
                           orgId ?? 'lndev-ui',
                           issue.identifier,
                           isProjectPath(pathname)
                        )}
                        className="min-w-0 flex items-center justify-start"
                     >
                        <span className="text-xs sm:text-sm font-medium sm:font-semibold truncate">
                           {issue.title}
                        </span>
                     </Link>
                     <IssueSubtaskPopover
                        issue={issue}
                        orgId={orgId ?? 'lndev-ui'}
                        projectPath={isProjectPath(pathname)}
                     />
                  </HStack>
               </div>
               {/* Columns in the account's order and widths: they carry the labels
                   printed by IssuesListHeader, so every cell renders even when empty.
                   VI: Các cột theo thứ tự và độ rộng của tài khoản: chúng mang nhãn do
                   IssuesListHeader in ra, nên mọi ô đều được vẽ kể cả khi trống. */}
               {order.map(
                  (key) =>
                     displayProperties[key] && (
                        <div key={key} className={ISSUE_COLUMN[key]} style={{ width: widths[key] }}>
                           {cell(key)}
                        </div>
                     )
               )}
            </motion.div>
         </ContextMenuTrigger>
         <IssueContextMenu issueId={issue.id} />
      </ContextMenu>
   );
}
