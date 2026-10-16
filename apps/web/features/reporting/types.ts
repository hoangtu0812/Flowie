export const reportApi = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/reports`;
export type ReportQuery = {
   fromDate: string;
   toDate: string;
   timezone: string;
   weekStart: number;
   selection: {
      teamId?: string;
      projectId?: string;
      query?: string;
      includeSubIssues?: boolean;
      filters?: { columnId: string; type: string; operator: string; values: string[] }[];
   };
};
export type DailyPoint = {
   day: string;
   created: number;
   completed: number;
   wip: number | null;
   unknown: number | null;
   complete: boolean;
};
export type WorkflowReport = {
   asOf: string;
   summary: Record<string, number>;
   flow: Record<string, number | null>;
   aging: Record<string, number>;
   reopens: { reopened: number; bugs_reopened: number };
   trend: DailyPoint[];
   statuses: { id: string; name: string; category: string; color?: string; count: number }[];
};
export type Workload = {
   id: string;
   week: string | null;
   assigneeId: string | null;
   assigneeName: string | null;
   count: number;
   estimatedEffort: number;
   missingEstimates: number;
   overdue: number;
};
export type ProjectReport = {
   id: string;
   projectId: string | null;
   name: string | null;
   total: number;
   open: number;
   created: number;
   completions: number;
   estimatedEffort: number;
   actualEffort: number;
};
export type ReportChange = {
   id: string;
   issueId: string;
   identifier: string;
   title: string;
   occurredAt: string;
   kind: string;
};
export function localToday(timezone: string) {
   const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
   }).formatToParts(new Date());
   const value = (type: string) => parts.find((row) => row.type === type)!.value;
   return `${value('year')}-${value('month')}-${value('day')}`;
}
export function recentQuery(days = 30, timezone = 'Asia/Ho_Chi_Minh'): ReportQuery {
   const end = localToday(timezone),
      start = new Date(end + 'T00:00:00Z');
   start.setUTCDate(start.getUTCDate() - days + 1);
   return {
      fromDate: start.toISOString().slice(0, 10),
      toDate: end,
      timezone,
      weekStart: 0,
      selection: { includeSubIssues: true },
   };
}
