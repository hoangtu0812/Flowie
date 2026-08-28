'use client';

import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { ISSUE_COLUMN, issueListMinWidth } from './issue-columns';

/** Column header of the issues "List" view, mirroring the projects list. */
export function IssuesListHeader() {
   const { displayProperties } = useDisplaySettingsStore();

   return (
      <div
         className="bg-container px-6 h-8 text-xs flex items-center text-muted-foreground border-b sticky top-0 z-20"
         style={{ minWidth: issueListMinWidth(displayProperties) }}
      >
         <div className="flex-1 min-w-0">Title</div>
         {displayProperties.labels && <div className={ISSUE_COLUMN.labels}>Labels</div>}
         {displayProperties.project && <div className={ISSUE_COLUMN.project}>Project</div>}
         {displayProperties.startDate && <div className={ISSUE_COLUMN.startDate}>Start</div>}
         {displayProperties.targetDate && <div className={ISSUE_COLUMN.targetDate}>End</div>}
         {displayProperties.estimatedEffort && (
            <div className={ISSUE_COLUMN.estimatedEffort}>Est. effort</div>
         )}
         {displayProperties.actualEffort && (
            <div className={ISSUE_COLUMN.actualEffort}>Act. effort</div>
         )}
         {displayProperties.cycle && <div className={ISSUE_COLUMN.cycle}>Cycle</div>}
         {displayProperties.created && <div className={ISSUE_COLUMN.created}>Created</div>}
         {displayProperties.dueDate && <div className={ISSUE_COLUMN.dueDate}>Due date</div>}
         {displayProperties.assignee && <div className={ISSUE_COLUMN.assignee}>Assignee</div>}
      </div>
   );
}
