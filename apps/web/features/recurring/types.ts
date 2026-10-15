export type ScheduleRule = {
   timezone: string;
   startDate: string;
   time: string;
   frequency: string;
   interval: number;
   weekdays: number[];
   monthDay: number;
};
export type RecurringTemplate = {
   title: string;
   description: string | null;
   priority: string;
   statusId: string | null;
   projectId: string | null;
   assigneeId: string | null;
   issueType: string;
   severity?: string | null;
   environment?: string | null;
   reproductionSteps?: string | null;
   expectedResult?: string | null;
   actualResult?: string | null;
};
export type Schedule = {
   id: string;
   teamId: string;
   name: string;
   rule: ScheduleRule;
   template: RecurringTemplate;
   dueAfterMinutes: number | null;
   version: number;
   active: boolean;
   nextRunAt: string;
   consecutiveFailures: number;
   createdBy: string;
   unavailableProject?: boolean;
};
export type Run = {
   id: string;
   state: string;
   scheduledFor: string;
   createdAt: string;
   identifier: string | null;
   errorCode: string | null;
   scheduleVersion: string;
};
export const recurringApi =
   (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1') + '/recurring-schedules';
