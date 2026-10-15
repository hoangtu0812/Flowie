'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { ISSUE_COLUMN, issueListMinWidth } from './issue-columns';

/** Column header of the issues "List" view, mirroring the projects list. */
export function IssuesListHeader() {
   const tx = useMessages(messages);

   const { displayProperties } = useDisplaySettingsStore();

   return (
      <div
         className="bg-container px-6 h-8 text-xs flex items-center text-muted-foreground border-b sticky top-0 z-20"
         style={{ minWidth: issueListMinWidth(displayProperties) }}
      >
         <div className="flex-1 min-w-0">{tx('Title')}</div>
         {displayProperties.labels && <div className={ISSUE_COLUMN.labels}>{tx('Labels')}</div>}
         {displayProperties.project && <div className={ISSUE_COLUMN.project}>{tx('Project')}</div>}
         {displayProperties.startDate && (
            <div className={ISSUE_COLUMN.startDate}>{tx('Start')}</div>
         )}
         {displayProperties.targetDate && (
            <div className={ISSUE_COLUMN.targetDate}>{tx('End')}</div>
         )}
         {displayProperties.estimatedEffort && (
            <div className={ISSUE_COLUMN.estimatedEffort}>{tx('Est. effort')}</div>
         )}
         {displayProperties.actualEffort && (
            <div className={ISSUE_COLUMN.actualEffort}>{tx('Act. effort')}</div>
         )}
         {displayProperties.cycle && <div className={ISSUE_COLUMN.cycle}>{tx('Cycle')}</div>}
         {displayProperties.created && <div className={ISSUE_COLUMN.created}>{tx('Created')}</div>}
         {displayProperties.dueDate && <div className={ISSUE_COLUMN.dueDate}>{tx('Due date')}</div>}
         {displayProperties.assignee && (
            <div className={ISSUE_COLUMN.assignee}>{tx('Assignee')}</div>
         )}
      </div>
   );
}
