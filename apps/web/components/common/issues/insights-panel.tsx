'use client';

import { Button } from '@/components/ui/button';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { Issue } from '@/mock-data/issues';
import { priorities } from '@/mock-data/priorities';
import type { Status } from '@/mock-data/status';
import { useIssuesStore } from '@/store/issues-store';
import { useIssueInsightsStore } from '@/store/issue-insights-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { X } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { usePanelFilter } from './use-panel-filter';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { toast } from 'sonner';

const PRIORITY_COLORS: Record<string, string> = {
   'no-priority': '#64748b',
   'urgent': '#eb5757',
   'high': '#f2994a',
   'medium': '#facc15',
   'low': '#4cb782',
};

interface InsightsRow {
   status: Status;
   total: number;
   byPriority: Record<string, number>;
}

interface InsightsPanelProps {
   issues: Issue[];
}

const STATUS_CATEGORY_ORDER: Record<Status['category'], number> = {
   triage: 0,
   backlog: 1,
   unstarted: 2,
   started: 3,
   completed: 4,
   canceled: 5,
};

/** Custom X axis tick rendering the status icon under each bar. */
function StatusTick({
   x = 0,
   y = 0,
   payload,
   statuses,
}: {
   x?: number;
   y?: number;
   payload?: { value: string };
   statuses: Status[];
}) {
   const currentStatus = statuses.find((status) => status.id === payload?.value);
   if (!currentStatus) return <g />;

   const Icon = currentStatus.icon;
   return (
      <g transform={`translate(${x - 7}, ${y + 2})`}>
         <Icon />
      </g>
   );
}

/**
 * Analytics side panel ("insights"): issue count sliced by status and
 * segmented by priority — stacked bar chart + detail table.
 */
export function InsightsPanel({ issues }: InsightsPanelProps) {
   const { closePanel } = useRightPanelStore();
   const { statuses } = useIssuesStore();
   const { settings, loadDefaults, saveDefaults } = useIssueInsightsStore();
   const { isActive, toggle } = usePanelFilter();

   useEffect(() => {
      void loadDefaults().catch(() => undefined);
   }, [loadDefaults]);

   const workflowStatuses = useMemo<Status[]>(() => {
      const source = statuses.length
         ? statuses
         : [...new Map(issues.map((issue) => [issue.status.id, issue.status])).values()];
      return [...source].sort(
         (left, right) =>
            STATUS_CATEGORY_ORDER[left.category] - STATUS_CATEGORY_ORDER[right.category] ||
            left.name.localeCompare(right.name)
      );
   }, [issues, statuses]);

   const rows = useMemo<InsightsRow[]>(() => {
      return workflowStatuses
         .map((s) => {
            const statusIssues = issues.filter((issue) => issue.status.id === s.id);
            const byPriority: Record<string, number> = {};
            for (const priority of priorities) {
               byPriority[priority.id] = statusIssues.filter(
                  (issue) => issue.priority.id === priority.id
               ).length;
            }
            return { status: s, total: statusIssues.length, byPriority };
         })
         .filter((row) => row.total > 0);
   }, [issues, workflowStatuses]);

   const chartData = useMemo(
      () =>
         rows.map((row) => ({
            id: row.status.id,
            name: row.status.name,
            ...row.byPriority,
         })),
      [rows]
   );

   return (
      <div className="flex flex-col h-full w-full">
         {/* Header */}
         <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
            <div className="flex items-baseline gap-1.5">
               <span className="text-xl font-semibold">{issues.length}</span>
               <span className="text-sm text-muted-foreground">issues</span>
            </div>
            <Button variant="ghost" size="icon" className="size-7" onClick={closePanel}>
               <X className="size-4" />
            </Button>
         </div>

         {/* Measure / Slice / Segment */}
         <div className="grid grid-cols-3 gap-2 px-4 pb-4 shrink-0">
            <div className="flex flex-col gap-1">
               <span className="text-xs text-muted-foreground">Measure</span>
               <Select value={settings.measure}>
                  <SelectTrigger className="h-8 text-xs w-full">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="issue-count">Issue count</SelectItem>
                  </SelectContent>
               </Select>
            </div>
            <div className="flex flex-col gap-1">
               <span className="text-xs text-muted-foreground">Slice</span>
               <Select value={settings.slice}>
                  <SelectTrigger className="h-8 text-xs w-full">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="status">Status</SelectItem>
                  </SelectContent>
               </Select>
            </div>
            <div className="flex flex-col gap-1">
               <span className="text-xs text-muted-foreground">Segment</span>
               <Select value={settings.segment}>
                  <SelectTrigger className="h-8 text-xs w-full">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="priority">Priority</SelectItem>
                  </SelectContent>
               </Select>
            </div>
         </div>

         {/* Stacked bar chart */}
         <div className="px-2 shrink-0">
            <ResponsiveContainer width="100%" height={220}>
               <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <XAxis
                     dataKey="id"
                     tick={<StatusTick statuses={workflowStatuses} />}
                     axisLine={false}
                     tickLine={false}
                     interval={0}
                  />
                  <YAxis
                     width={34}
                     tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.6 }}
                     axisLine={false}
                     tickLine={false}
                     allowDecimals={false}
                  />
                  <Tooltip
                     cursor={{ fill: 'var(--accent)', opacity: 0.4 }}
                     contentStyle={{
                        background: 'var(--popover)',
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        fontSize: 12,
                        color: 'var(--popover-foreground)',
                     }}
                  />
                  {priorities.map((priority) => (
                     <Bar
                        key={priority.id}
                        dataKey={priority.id}
                        name={priority.name}
                        stackId="issues"
                        fill={PRIORITY_COLORS[priority.id]}
                        isAnimationActive={false}
                        maxBarSize={22}
                     />
                  ))}
               </BarChart>
            </ResponsiveContainer>
         </div>

         {/* Detail table */}
         <div className="flex-1 overflow-auto border-t mt-2">
            <table className="w-full text-sm">
               <thead className="sticky top-0 bg-container z-10">
                  <tr className="text-left text-muted-foreground">
                     <th className="font-medium px-4 py-2">Status</th>
                     <th className="font-medium px-3 py-2 text-right">Issue count</th>
                     {priorities.map((priority) => {
                        const Icon = priority.icon;
                        return (
                           <th key={priority.id} className="font-medium px-3 py-2">
                              <div className="flex items-center gap-1.5 whitespace-nowrap">
                                 <Icon className="size-3.5 text-muted-foreground" />
                                 <span className="hidden xl:inline">{priority.name}</span>
                              </div>
                           </th>
                        );
                     })}
                  </tr>
               </thead>
               <tbody>
                  {rows.map((row) => {
                     const Icon = row.status.icon;
                     const target = { columnId: 'status' as const, value: row.status.id };
                     const active = isActive(target);
                     return (
                        <tr
                           key={row.status.id}
                           onClick={() => toggle(target)}
                           className={cn(
                              'group border-t border-border/50 cursor-pointer transition-colors hover:bg-accent/50',
                              active && 'bg-accent hover:bg-accent'
                           )}
                        >
                           <td className="px-4 py-2">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                 <Icon />
                                 <span className="truncate max-w-28">{row.status.name}</span>
                                 <span className="text-[10px] px-1.5 py-0.5 rounded bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    {active ? 'Clear filter' : 'Filter'}
                                 </span>
                              </div>
                           </td>
                           <td className="px-3 py-2 text-right font-medium">{row.total}</td>
                           {priorities.map((priority) => (
                              <td
                                 key={priority.id}
                                 className="px-3 py-2 text-right text-muted-foreground"
                              >
                                 {row.byPriority[priority.id]}
                              </td>
                           ))}
                        </tr>
                     );
                  })}
               </tbody>
            </table>
         </div>

         <div className="shrink-0 border-t px-4 py-3">
            <button
               type="button"
               className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline"
               onClick={() =>
                  void saveDefaults()
                     .then(() => toast.success('Workspace insight default saved.'))
                     .catch((error: unknown) =>
                        toast.error(
                           error instanceof Error
                              ? error.message
                              : 'Could not save workspace insight default.'
                        )
                     )
               }
            >
               Set default for everyone
            </button>
         </div>
      </div>
   );
}
