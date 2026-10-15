export const slaApi = `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/slas`;
export type WorkingWindow = { weekday: number; start: string; end: string };
export type BusinessCalendar = { timezone: string; windows: WorkingWindow[]; holidays: string[] };
export const defaultCalendar = (): BusinessCalendar => ({
   timezone: 'Asia/Ho_Chi_Minh',
   windows: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '09:00', end: '17:00' })),
   holidays: [],
});
export type PolicyValues = {
   name: string;
   description: string | null;
   teamId: string | null;
   priority: string | null;
   deadlineMinutes: number;
   enabled: boolean;
   calendar: BusinessCalendar | null;
   pauseStatusIds: string[];
   warningMinutes: number;
   escalateToId: string | null;
};
export type SlaPolicy = PolicyValues & {
   id: string;
   version: number;
   archivedAt: string | null;
   createdAt: string;
   updatedAt: string;
};
export type SlaCycle = {
   cycle: number;
   policyVersion: number;
   policyName: string;
   state: string;
   budgetSeconds: number;
   remainingSeconds: number;
   startedAt: string;
   closedAt: string | null;
   dueAt: string | null;
   warningAt: string | null;
   breachedAt: string | null;
   escalationCode: string | null;
   warningProcessedAt: string | null;
   breachProcessedAt: string | null;
   bindingReason: string;
   alertResults: Record<string, { outcome: string; recipients: number }>;
   calendar: BusinessCalendar | null;
};
export type IssueSla = {
   issueVersion: number;
   latestCycle: number | null;
   current: SlaCycle | null;
   coverage: 'MANUAL' | 'TRACKED' | 'RESTRICTED' | 'UNMANAGED';
   pending: boolean;
   job: {
      generation: number;
      attempts: number;
      errorCode: string | null;
      failedAt: string | null;
      nextAttemptAt: string | null;
   } | null;
   history: SlaCycle[];
};
export type VersionPage = { total: number; nextBefore: number | null };
export const dateLabel = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');
