import type { WorkflowReport } from '@/features/reporting/types';

export type ProjectPoint = {
   id: string;
   project_id: string | null;
   name: string | null;
   created: number;
   completed: number;
   estimated: number;
   actual: number;
};
export type DashboardReport = WorkflowReport & {
   effort: { day: string; estimated: number; actual: number }[];
   projectThroughput: ProjectPoint[];
   projectEffort: ProjectPoint[];
   projectGroups: number;
   missingEstimatedDates: number;
   missingActualDates: number;
};
