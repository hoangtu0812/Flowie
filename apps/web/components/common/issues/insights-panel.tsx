'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useRightPanelStore } from '@/store/right-panel-store';
import type { Issue } from '@/types/issues';
import { X } from 'lucide-react';
import type { ComponentType } from 'react';
import { useMemo, useState } from 'react';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PanelFilterTarget } from './use-panel-filter';
import { usePanelFilter } from './use-panel-filter';

const SEGMENT_COLORS = [
   '#64748b',
   '#eb5757',
   '#f2994a',
   '#facc15',
   '#4cb782',
   '#5e6ad2',
   '#a855f7',
];

type Dimension = 'status' | 'priority' | 'assignee' | 'project';
type Icon = ComponentType<{ className?: string }>;

const DIMENSIONS: Array<{ value: Dimension; label: string }> = [
   { value: 'status', label: 'Status' },
   { value: 'priority', label: 'Priority' },
   { value: 'assignee', label: 'Assignee' },
   { value: 'project', label: 'Project' },
];

interface DimensionValue {
   id: string;
   label: string;
   filterValue: string;
   icon?: Icon;
   avatarUrl?: string | null;
   color?: string;
}

interface InsightsRow {
   value: DimensionValue;
   total: number;
   bySegment: Record<string, number>;
}

interface InsightsPanelProps {
   issues: Issue[];
}

const valueFor = (issue: Issue, dimension: Dimension): DimensionValue => {
   if (dimension === 'status') {
      return {
         id: `status:${issue.status.id}`,
         label: issue.status.name,
         filterValue: issue.status.id,
         icon: issue.status.icon as Icon,
         color: issue.status.color,
      };
   }
   if (dimension === 'priority') {
      return {
         id: `priority:${issue.priority.id}`,
         label: issue.priority.name,
         filterValue: issue.priority.id,
         icon: issue.priority.icon as Icon,
      };
   }
   if (dimension === 'assignee') {
      const assignee = issue.assignee;
      return {
         id: `assignee:${assignee?.id ?? 'unassigned'}`,
         label: assignee?.name ?? 'Unassigned',
         filterValue: assignee?.id ?? 'unassigned',
         avatarUrl: assignee?.avatarUrl ?? null,
      };
   }
   const project = issue.project;
   return {
      id: `project:${project?.id ?? 'no-project'}`,
      label: project?.name ?? 'No project',
      filterValue: project?.id ?? 'no-project',
      icon: project?.icon as Icon | undefined,
   };
};

const filterColumnFor = (dimension: Dimension): PanelFilterTarget['columnId'] => dimension;

function ValueGlyph({ value }: { value: DimensionValue }) {
   if (value.avatarUrl !== undefined) {
      return (
         <Avatar className="size-4 shrink-0">
            <AvatarImage src={value.avatarUrl ?? undefined} alt={value.label} />
            <AvatarFallback>{value.label[0]}</AvatarFallback>
         </Avatar>
      );
   }
   if (value.icon) {
      const IconComponent = value.icon;
      return <IconComponent className="size-3.5 shrink-0" />;
   }
   return (
      <span
         className="size-2.5 rounded-full shrink-0"
         style={{ backgroundColor: value.color ?? '#64748b' }}
      />
   );
}

/**
 * Analytics based exclusively on live issues supplied by the current Circle page.
 * Custom workspace statuses and real user/project assignments are calculated at runtime.
 */
export function InsightsPanel({ issues }: InsightsPanelProps) {
   const { closePanel } = useRightPanelStore();
   const { isActive, toggle } = usePanelFilter();
   const [sliceBy, setSliceBy] = useState<Dimension>('status');
   const [segmentBy, setSegmentBy] = useState<Dimension>('priority');

   const { rows, segments } = useMemo(() => {
      const sliceValues = new Map<string, DimensionValue>();
      const segmentValues = new Map<string, DimensionValue>();
      const issuesBySlice = new Map<string, Issue[]>();

      for (const issue of issues) {
         const slice = valueFor(issue, sliceBy);
         const segment = valueFor(issue, segmentBy);
         sliceValues.set(slice.id, slice);
         segmentValues.set(segment.id, segment);
         const bucket = issuesBySlice.get(slice.id) ?? [];
         bucket.push(issue);
         issuesBySlice.set(slice.id, bucket);
      }

      const segmentList = [...segmentValues.values()];
      const rowList: InsightsRow[] = [...sliceValues.values()].map((slice) => {
         const bucket = issuesBySlice.get(slice.id) ?? [];
         const bySegment = Object.fromEntries(segmentList.map((segment) => [segment.id, 0]));
         for (const issue of bucket) bySegment[valueFor(issue, segmentBy).id] += 1;
         return { value: slice, total: bucket.length, bySegment };
      });

      return { rows: rowList, segments: segmentList };
   }, [issues, segmentBy, sliceBy]);

   const chartData = useMemo(
      () => rows.map((row) => ({ id: row.value.id, name: row.value.label, ...row.bySegment })),
      [rows]
   );

   const segmentColor = (segment: DimensionValue, index: number) => {
      if (segment.id.startsWith('priority:')) {
         const priorityColors: Record<string, string> = {
            'priority:no-priority': '#64748b',
            'priority:urgent': '#eb5757',
            'priority:high': '#f2994a',
            'priority:medium': '#facc15',
            'priority:low': '#4cb782',
         };
         return priorityColors[segment.id] ?? SEGMENT_COLORS[index % SEGMENT_COLORS.length];
      }
      return segment.color ?? SEGMENT_COLORS[index % SEGMENT_COLORS.length];
   };

   return (
      <div className="flex flex-col h-full w-full">
         <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
            <div className="flex items-baseline gap-1.5">
               <span className="text-xl font-semibold">{issues.length}</span>
               <span className="text-sm text-muted-foreground">issues</span>
            </div>
            <Button variant="ghost" size="icon" className="size-7" onClick={closePanel}>
               <X className="size-4" />
            </Button>
         </div>

         <div className="grid grid-cols-3 gap-2 px-4 pb-4 shrink-0">
            <div className="flex flex-col gap-1">
               <span className="text-xs text-muted-foreground">Measure</span>
               <Select value="issue-count">
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
               <Select value={sliceBy} onValueChange={(value) => setSliceBy(value as Dimension)}>
                  <SelectTrigger className="h-8 text-xs w-full">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     {DIMENSIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                           {option.label}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            </div>
            <div className="flex flex-col gap-1">
               <span className="text-xs text-muted-foreground">Segment</span>
               <Select
                  value={segmentBy}
                  onValueChange={(value) => setSegmentBy(value as Dimension)}
               >
                  <SelectTrigger className="h-8 text-xs w-full">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     {DIMENSIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                           {option.label}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            </div>
         </div>

         <div className="px-2 shrink-0">
            <ResponsiveContainer width="100%" height={220}>
               <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                  <XAxis
                     dataKey="id"
                     tick={({ x = 0, y = 0, payload }) => {
                        const value = rows.find((row) => row.value.id === payload?.value)?.value;
                        if (!value) return <g />;
                        if (sliceBy === 'status' && value.icon) {
                           const IconComponent = value.icon;
                           return (
                              <g transform={`translate(${x - 7}, ${y + 2})`}>
                                 <IconComponent />
                              </g>
                           );
                        }
                        return (
                           <text
                              x={x}
                              y={y + 13}
                              textAnchor="middle"
                              className="fill-muted-foreground text-[10px]"
                           >
                              {value.label.slice(0, 10)}
                           </text>
                        );
                     }}
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
                  {segments.map((segment, index) => (
                     <Bar
                        key={segment.id}
                        dataKey={segment.id}
                        name={segment.label}
                        stackId="issues"
                        fill={segmentColor(segment, index)}
                        isAnimationActive={false}
                        maxBarSize={22}
                     />
                  ))}
               </BarChart>
            </ResponsiveContainer>
         </div>

         <div className="flex-1 overflow-auto border-t mt-2">
            <table className="w-full text-sm">
               <thead className="sticky top-0 bg-container z-10">
                  <tr className="text-left text-muted-foreground">
                     <th className="font-medium px-4 py-2">
                        {DIMENSIONS.find((item) => item.value === sliceBy)?.label}
                     </th>
                     <th className="font-medium px-3 py-2 text-right">Issue count</th>
                     {segments.map((segment) => (
                        <th key={segment.id} className="font-medium px-3 py-2">
                           <div className="flex items-center gap-1.5 whitespace-nowrap">
                              <ValueGlyph value={segment} />
                              <span className="hidden xl:inline">{segment.label}</span>
                           </div>
                        </th>
                     ))}
                  </tr>
               </thead>
               <tbody>
                  {rows.map((row) => {
                     const target: PanelFilterTarget = {
                        columnId: filterColumnFor(sliceBy),
                        value: row.value.filterValue,
                     };
                     const active = isActive(target);
                     return (
                        <tr
                           key={row.value.id}
                           onClick={() => toggle(target)}
                           className={cn(
                              'group border-t border-border/50 cursor-pointer transition-colors hover:bg-accent/50',
                              active && 'bg-accent hover:bg-accent'
                           )}
                        >
                           <td className="px-4 py-2">
                              <div className="flex items-center gap-2 whitespace-nowrap">
                                 <ValueGlyph value={row.value} />
                                 <span className="truncate max-w-28">{row.value.label}</span>
                                 <span className="text-[10px] px-1.5 py-0.5 rounded bg-background/80 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    {active ? 'Clear filter' : 'Filter'}
                                 </span>
                              </div>
                           </td>
                           <td className="px-3 py-2 text-right font-medium">{row.total}</td>
                           {segments.map((segment) => (
                              <td
                                 key={segment.id}
                                 className="px-3 py-2 text-right text-muted-foreground"
                              >
                                 {row.bySegment[segment.id] ?? 0}
                              </td>
                           ))}
                        </tr>
                     );
                  })}
               </tbody>
            </table>
         </div>
      </div>
   );
}
