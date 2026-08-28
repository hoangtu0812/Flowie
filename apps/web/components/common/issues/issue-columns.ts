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

const ISSUE_COLUMN_WIDTH: Record<keyof typeof ISSUE_COLUMN, number> = {
   labels: 160,
   project: 120,
   startDate: 82,
   targetDate: 82,
   estimatedEffort: 112,
   actualEffort: 112,
   cycle: 90,
   created: 80,
   dueDate: 90,
   assignee: 70,
};

type IssueColumnVisibility = Record<keyof typeof ISSUE_COLUMN, boolean>;

/**
 * The title cell contains the status controls and needs a usable minimum
 * width. When a side panel reduces the list viewport, the list scrolls as one
 * table instead of letting the flexible title cell collapse under Labels.
 */
export const issueListMinWidth = (visibility: IssueColumnVisibility) =>
   48 +
   320 +
   (Object.entries(ISSUE_COLUMN_WIDTH) as Array<[keyof typeof ISSUE_COLUMN, number]>).reduce(
      (width, [column, columnWidth]) => width + (visibility[column] ? columnWidth : 0),
      0
   );
