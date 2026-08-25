import { format, parseISO } from 'date-fns';

export type CycleStatus = 'planned' | 'upcoming' | 'current' | 'completed';

export interface CycleBurnupPoint {
   date: string;
   scope: number;
   started: number;
   completed: number;
   ideal: number;
}

/** UI shape computed from persisted Cycle and Issue records. */
export interface Cycle {
   id: string;
   number: number;
   name: string;
   teamId: string;
   status: CycleStatus;
   startDate: string;
   endDate: string;
   capacity: number;
   scope: number;
   scopeDelta: number;
   started: number;
   completed: number;
   successRate?: number;
   burnup?: CycleBurnupPoint[];
}

export function formatCycleDateRange(cycle: Cycle): string {
   return `${format(parseISO(cycle.startDate), 'MMM d')} → ${format(parseISO(cycle.endDate), 'MMM d')}`;
}

export const cycleStatusLabel: Record<CycleStatus, string> = {
   planned: 'Planned',
   upcoming: 'Upcoming',
   current: 'Current',
   completed: 'Completed',
};
