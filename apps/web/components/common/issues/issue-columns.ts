/**
 * Column geometry shared by the issues list header and every issue row.
 * Both sides read from here so a width or a responsive breakpoint can never
 * drift apart and leave the labels hanging over the wrong column.
 */
export const ISSUE_COLUMN = {
   labels: 'hidden lg:flex items-center gap-1 w-[160px] shrink-0 pl-2 overflow-hidden',
   project: 'hidden xl:flex items-center w-[120px] shrink-0 pl-2 overflow-hidden',
   startDate: 'hidden xl:flex items-center w-[82px] shrink-0 pl-2 overflow-hidden',
   targetDate: 'hidden xl:flex items-center w-[82px] shrink-0 pl-2 overflow-hidden',
   estimatedEffort: 'hidden xl:flex items-center w-[112px] shrink-0 pl-2 overflow-hidden',
   actualEffort: 'hidden xl:flex items-center w-[112px] shrink-0 pl-2 overflow-hidden',
   cycle: 'hidden xl:flex items-center w-[90px] shrink-0 pl-2',
   created: 'hidden sm:flex items-center w-[80px] shrink-0 pl-2',
   dueDate: 'hidden sm:flex items-center w-[90px] shrink-0 pl-2',
   assignee: 'flex items-center w-[70px] shrink-0 pl-2',
} as const;
