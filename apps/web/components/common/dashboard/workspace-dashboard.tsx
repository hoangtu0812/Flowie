'use client';

import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/common/loading-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import {
   AlertTriangle,
   CalendarRange,
   CheckCircle2,
   CircleDot,
   ClipboardList,
   RotateCcw,
   Timer,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
   Bar,
   BarChart,
   CartesianGrid,
   Cell,
   Legend,
   Line,
   LineChart,
   Pie,
   PieChart,
   ResponsiveContainer,
   Tooltip,
   XAxis,
   YAxis,
} from 'recharts';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const DAY = 86_400_000;

type RangePreset = 'week' | 'month' | 'quarter' | 'year' | 'custom';

type DashboardIssue = {
   id: string;
   title: string;
   projectId: string | null;
   project: { id: string; name: string } | null;
   status: { id: string; name: string; category: string; color: string };
   createdAt: string;
   completedAt: string | null;
   dueDate: string | null;
   estimatedEffort: number | null;
   actualEffort: number | null;
};

type DashboardProject = { id: string; name: string };

const dayKey = (date: Date) =>
   `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const dateKey = (value: string | null | undefined) => value?.slice(0, 10) ?? null;

const daysBefore = (count: number) => {
   const date = new Date();
   date.setHours(0, 0, 0, 0);
   date.setDate(date.getDate() - count + 1);
   return dayKey(date);
};

const today = () => dayKey(new Date());

const presetStart = (preset: Exclude<RangePreset, 'custom'>) =>
   daysBefore({ week: 7, month: 30, quarter: 90, year: 365 }[preset]);

const inRange = (value: string | null, from: string, to: string) =>
   Boolean(value && value >= from && value <= to);

const displayDate = (value: string) =>
   new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(
      new Date(`${value}T00:00:00`)
   );

const fullDate = (value: string) =>
   new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(
      new Date(`${value}T00:00:00`)
   );

function daysInRange(from: string, to: string) {
   const start = new Date(`${from}T00:00:00`);
   const end = new Date(`${to}T00:00:00`);
   const keys: string[] = [];
   for (let current = start; current <= end; current = new Date(current.getTime() + DAY)) {
      keys.push(dayKey(current));
   }
   return keys;
}

function MetricCard({
   label,
   value,
   icon: Icon,
   tone = 'default',
   hint,
}: {
   label: string;
   value: string | number;
   icon: typeof ClipboardList;
   tone?: 'default' | 'success' | 'warning';
   hint: string;
}) {
   const toneClass = {
      default: 'bg-primary/10 text-primary',
      success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
   }[tone];

   return (
      <Card className="gap-0 py-0 shadow-none">
         <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
               <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
               </div>
               <span
                  className={cn('flex size-8 items-center justify-center rounded-lg', toneClass)}
               >
                  <Icon className="size-4" />
               </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{hint}</p>
         </CardContent>
      </Card>
   );
}

/** Workspace-level issue analytics derived from records visible to the current member. */
export function WorkspaceDashboard() {
   const [issues, setIssues] = useState<DashboardIssue[]>([]);
   const [projects, setProjects] = useState<DashboardProject[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();
   const [projectId, setProjectId] = useState('all');
   const [statusId, setStatusId] = useState('all');
   const [preset, setPreset] = useState<RangePreset>('month');
   const [from, setFrom] = useState(() => presetStart('month'));
   const [to, setTo] = useState(today);
   const [selectedDay, setSelectedDay] = useState<string>();

   const load = useCallback(async () => {
      setLoading(true);
      setError(undefined);
      try {
         const workspace = await loadCurrentWorkspace();
         const query = new URLSearchParams({ workspaceId: workspace.id });
         const [issuesResponse, projectsResponse] = await Promise.all([
            authenticatedFetch(`${api}/issues?${query}`),
            authenticatedFetch(`${api}/projects?${query}`),
         ]);
         if (!issuesResponse.ok || !projectsResponse.ok) {
            throw new Error('Could not load workspace analytics.');
         }
         const issuesPayload = (await issuesResponse.json()) as { data: DashboardIssue[] };
         const projectsPayload = (await projectsResponse.json()) as { data: DashboardProject[] };
         setIssues(issuesPayload.data);
         setProjects(
            projectsPayload.data.map((project) => ({ id: project.id, name: project.name }))
         );
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : 'Could not load workspace analytics.');
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void load();
   }, [load]);

   const applyPreset = (next: Exclude<RangePreset, 'custom'>) => {
      setPreset(next);
      setFrom(presetStart(next));
      setTo(today());
      setSelectedDay(undefined);
   };

   const setCustomDate = (field: 'from' | 'to', value: string) => {
      setPreset('custom');
      setSelectedDay(undefined);
      if (field === 'from') setFrom(value);
      else setTo(value);
   };

   const scopedIssues = useMemo(
      () => issues.filter((issue) => projectId === 'all' || issue.projectId === projectId),
      [issues, projectId]
   );

   const rangeIssues = useMemo(
      () =>
         scopedIssues.filter((issue) => {
            const created = dateKey(issue.createdAt);
            const completed = dateKey(issue.completedAt);
            return inRange(created, from, to) || inRange(completed, from, to);
         }),
      [from, scopedIssues, to]
   );

   const activeAtEnd = useMemo(
      () =>
         scopedIssues.filter((issue) => {
            const created = dateKey(issue.createdAt);
            const completed = dateKey(issue.completedAt);
            return Boolean(created && created <= to && (!completed || completed > to));
         }),
      [scopedIssues, to]
   );

   const filteredActive = useMemo(
      () => activeAtEnd.filter((issue) => statusId === 'all' || issue.status.id === statusId),
      [activeAtEnd, statusId]
   );

   const trend = useMemo(() => {
      const created = new Map<string, number>();
      const completed = new Map<string, number>();
      for (const issue of scopedIssues) {
         const createdAt = dateKey(issue.createdAt);
         const completedAt = dateKey(issue.completedAt);
         if (inRange(createdAt, from, to) && createdAt)
            created.set(createdAt, (created.get(createdAt) ?? 0) + 1);
         if (inRange(completedAt, from, to) && completedAt) {
            completed.set(completedAt, (completed.get(completedAt) ?? 0) + 1);
         }
      }
      return daysInRange(from, to).map((day) => ({
         day,
         label: displayDate(day),
         created: created.get(day) ?? 0,
         done: completed.get(day) ?? 0,
      }));
   }, [from, scopedIssues, to]);

   const statusData = useMemo(() => {
      const groups = new Map<string, { id: string; name: string; color: string; count: number }>();
      for (const issue of activeAtEnd) {
         const current = groups.get(issue.status.id) ?? {
            id: issue.status.id,
            name: issue.status.name,
            color: issue.status.color,
            count: 0,
         };
         current.count += 1;
         groups.set(issue.status.id, current);
      }
      return [...groups.values()].sort((left, right) => right.count - left.count);
   }, [activeAtEnd]);

   const projectData = useMemo(() => {
      const groups = new Map<string, { id: string; name: string; created: number; done: number }>();
      for (const issue of rangeIssues) {
         const key = issue.projectId ?? 'no-project';
         const current = groups.get(key) ?? {
            id: key,
            name: issue.project?.name ?? 'No project',
            created: 0,
            done: 0,
         };
         if (inRange(dateKey(issue.createdAt), from, to)) current.created += 1;
         if (inRange(dateKey(issue.completedAt), from, to)) current.done += 1;
         groups.set(key, current);
      }
      return [...groups.values()]
         .sort((left, right) => right.created + right.done - left.created - left.done)
         .slice(0, 8);
   }, [from, rangeIssues, to]);

   const effortData = useMemo(() => {
      const groups = new Map<
         string,
         { id: string; name: string; estimated: number; actual: number }
      >();
      for (const issue of rangeIssues) {
         const key = issue.projectId ?? 'no-project';
         const current = groups.get(key) ?? {
            id: key,
            name: issue.project?.name ?? 'No project',
            estimated: 0,
            actual: 0,
         };
         current.estimated += issue.estimatedEffort ?? 0;
         current.actual += issue.actualEffort ?? 0;
         groups.set(key, current);
      }
      return [...groups.values()]
         .sort((left, right) => right.estimated - left.estimated)
         .slice(0, 8);
   }, [rangeIssues]);

   const metrics = useMemo(() => {
      const created = trend.reduce((total, day) => total + day.created, 0);
      const done = trend.reduce((total, day) => total + day.done, 0);
      const overdue = filteredActive.filter((issue) => {
         const dueDate = dateKey(issue.dueDate);
         return Boolean(dueDate && dueDate < to);
      }).length;
      const estimated = rangeIssues.reduce(
         (total, issue) => total + (issue.estimatedEffort ?? 0),
         0
      );
      const actual = rangeIssues.reduce((total, issue) => total + (issue.actualEffort ?? 0), 0);
      return {
         created,
         done,
         overdue,
         estimated,
         actual,
         completion: created ? Math.round((done / created) * 100) : 0,
      };
   }, [filteredActive, rangeIssues, to, trend]);

   const selectedDayIssues = useMemo(
      () =>
         selectedDay
            ? scopedIssues.filter(
                 (issue) =>
                    dateKey(issue.createdAt) === selectedDay ||
                    dateKey(issue.completedAt) === selectedDay
              )
            : [],
      [scopedIssues, selectedDay]
   );

   const resetFilters = () => {
      setProjectId('all');
      setStatusId('all');
      setSelectedDay(undefined);
      applyPreset('month');
   };

   if (loading) {
      return <LoadingState label="Loading workspace analytics…" />;
   }

   if (error) {
      return (
         <div className="m-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">Workspace analytics could not be loaded.</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
            <Button className="mt-3" size="sm" variant="outline" onClick={() => void load()}>
               Try again
            </Button>
         </div>
      );
   }

   return (
      <div className="mx-auto w-full max-w-[1600px] space-y-5 p-4 md:p-6">
         <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
            <div>
               <h1 className="text-xl font-semibold tracking-tight">Workspace dashboard</h1>
               <p className="mt-1 text-sm text-muted-foreground">
                  Issue delivery, throughput, workload and risk across the workspace.
               </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
               <label className="grid gap-1 text-xs text-muted-foreground">
                  Project
                  <Select value={projectId} onValueChange={(value) => setProjectId(value)}>
                     <SelectTrigger className="w-[190px]">
                        <SelectValue placeholder="All projects" />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="all">All projects</SelectItem>
                        {projects.map((project) => (
                           <SelectItem key={project.id} value={project.id}>
                              {project.name}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
               </label>
               <label className="grid gap-1 text-xs text-muted-foreground">
                  From
                  <Input
                     className="w-[142px]"
                     type="date"
                     max={to}
                     value={from}
                     onChange={(event) => setCustomDate('from', event.target.value)}
                  />
               </label>
               <label className="grid gap-1 text-xs text-muted-foreground">
                  To
                  <Input
                     className="w-[142px]"
                     type="date"
                     min={from}
                     max={today()}
                     value={to}
                     onChange={(event) => setCustomDate('to', event.target.value)}
                  />
               </label>
               <Button
                  size="sm"
                  variant="outline"
                  onClick={resetFilters}
                  title="Reset dashboard filters"
               >
                  <RotateCcw className="size-3.5" /> Reset
               </Button>
            </div>
         </div>

         <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-muted/30 p-1 w-fit">
            {(
               [
                  ['week', '1 week'],
                  ['month', '1 month'],
                  ['quarter', '1 quarter'],
                  ['year', '1 year'],
               ] as const
            ).map(([value, label]) => (
               <Button
                  key={value}
                  size="xs"
                  variant={preset === value ? 'secondary' : 'ghost'}
                  onClick={() => applyPreset(value)}
               >
                  {label}
               </Button>
            ))}
            <span className="ml-2 mr-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
               <CalendarRange className="size-3.5" /> {fullDate(from)} – {fullDate(to)}
            </span>
         </div>

         <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
               label="Created"
               value={metrics.created}
               icon={ClipboardList}
               hint="New issues in this period"
            />
            <MetricCard
               label="Done"
               value={metrics.done}
               icon={CheckCircle2}
               tone="success"
               hint="Completed in this period"
            />
            <MetricCard
               label="Completion rate"
               value={`${metrics.completion}%`}
               icon={CircleDot}
               hint="Done divided by created"
            />
            <MetricCard
               label="Open at period end"
               value={filteredActive.length}
               icon={Timer}
               hint="Current scope at selected end date"
            />
            <MetricCard
               label="Overdue"
               value={metrics.overdue}
               icon={AlertTriangle}
               tone="warning"
               hint="Open issues past their due date"
            />
         </div>

         <div className="grid gap-5 xl:grid-cols-3">
            <Card className="gap-0 py-0 shadow-none xl:col-span-2">
               <CardHeader className="flex-row items-center justify-between space-y-0 px-5 py-4">
                  <div>
                     <CardTitle className="text-sm">Issue throughput</CardTitle>
                     <p className="mt-1 text-xs text-muted-foreground">
                        Created and completed issues per day. Click a point to inspect that day.
                     </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                     <span className="flex items-center gap-1.5">
                        <i className="size-2 rounded-full bg-primary" /> Created
                     </span>
                     <span className="flex items-center gap-1.5">
                        <i className="size-2 rounded-full bg-emerald-500" /> Done
                     </span>
                  </div>
               </CardHeader>
               <CardContent className="h-[300px] px-2 pb-4 sm:px-4">
                  <ResponsiveContainer width="100%" height="100%">
                     <LineChart
                        data={trend}
                        margin={{ top: 12, right: 16, left: -16, bottom: 0 }}
                        onClick={(event) => {
                           const point = event?.activePayload?.[0]?.payload as
                              { day?: string } | undefined;
                           if (point?.day) setSelectedDay(point.day);
                        }}
                     >
                        <CartesianGrid
                           strokeDasharray="3 3"
                           vertical={false}
                           className="stroke-border"
                        />
                        <XAxis
                           dataKey="label"
                           minTickGap={28}
                           tickLine={false}
                           axisLine={false}
                           fontSize={11}
                        />
                        <YAxis
                           allowDecimals={false}
                           tickLine={false}
                           axisLine={false}
                           fontSize={11}
                        />
                        <Tooltip
                           labelFormatter={(_, payload) => {
                              const day = payload[0]?.payload?.day as string | undefined;
                              return day ? fullDate(day) : '';
                           }}
                           contentStyle={{
                              borderRadius: 8,
                              borderColor: 'var(--border)',
                              fontSize: 12,
                           }}
                        />
                        <Line
                           type="monotone"
                           dataKey="created"
                           name="Created"
                           stroke="var(--primary)"
                           strokeWidth={2}
                           dot={false}
                           activeDot={{ r: 4 }}
                        />
                        <Line
                           type="monotone"
                           dataKey="done"
                           name="Done"
                           stroke="#10b981"
                           strokeWidth={2}
                           dot={false}
                           activeDot={{ r: 4 }}
                        />
                     </LineChart>
                  </ResponsiveContainer>
               </CardContent>
            </Card>

            <Card className="gap-0 py-0 shadow-none">
               <CardHeader className="px-5 py-4">
                  <CardTitle className="text-sm">Open work by status</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                     Click a slice to focus the dashboard.
                  </p>
               </CardHeader>
               <CardContent className="h-[300px] px-2 pb-4">
                  {statusData.length ? (
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                           <Pie
                              data={statusData}
                              dataKey="count"
                              nameKey="name"
                              innerRadius={58}
                              outerRadius={90}
                              paddingAngle={3}
                              onClick={(entry) => setStatusId(entry.id)}
                           >
                              {statusData.map((entry) => (
                                 <Cell key={entry.id} fill={entry.color} />
                              ))}
                           </Pie>
                           <Tooltip
                              contentStyle={{
                                 borderRadius: 8,
                                 borderColor: 'var(--border)',
                                 fontSize: 12,
                              }}
                           />
                           <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        </PieChart>
                     </ResponsiveContainer>
                  ) : (
                     <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                        No open issues at this date.
                     </div>
                  )}
               </CardContent>
            </Card>
         </div>

         <div className="grid gap-5 xl:grid-cols-2">
            <Card className="gap-0 py-0 shadow-none">
               <CardHeader className="flex-row items-center justify-between space-y-0 px-5 py-4">
                  <div>
                     <CardTitle className="text-sm">Throughput by project</CardTitle>
                     <p className="mt-1 text-xs text-muted-foreground">
                        Click a bar to filter by that project.
                     </p>
                  </div>
                  {projectId !== 'all' && <span className="text-xs text-primary">Filtered</span>}
               </CardHeader>
               <CardContent className="h-[280px] px-2 pb-4 sm:px-4">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart
                        data={projectData}
                        layout="vertical"
                        margin={{ top: 0, right: 16, left: 24, bottom: 0 }}
                        onClick={(event) => {
                           const point = event?.activePayload?.[0]?.payload as
                              { id?: string } | undefined;
                           if (point?.id)
                              setProjectId(point.id === 'no-project' ? 'all' : point.id);
                        }}
                     >
                        <CartesianGrid
                           strokeDasharray="3 3"
                           horizontal={false}
                           className="stroke-border"
                        />
                        <XAxis
                           type="number"
                           allowDecimals={false}
                           tickLine={false}
                           axisLine={false}
                           fontSize={11}
                        />
                        <YAxis
                           dataKey="name"
                           type="category"
                           width={105}
                           tickLine={false}
                           axisLine={false}
                           fontSize={11}
                           tickFormatter={(value) => String(value).slice(0, 18)}
                        />
                        <Tooltip
                           contentStyle={{
                              borderRadius: 8,
                              borderColor: 'var(--border)',
                              fontSize: 12,
                           }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                           dataKey="created"
                           name="Created"
                           fill="var(--primary)"
                           radius={[0, 4, 4, 0]}
                        />
                        <Bar dataKey="done" name="Done" fill="#10b981" radius={[0, 4, 4, 0]} />
                     </BarChart>
                  </ResponsiveContainer>
               </CardContent>
            </Card>

            <Card className="gap-0 py-0 shadow-none">
               <CardHeader className="flex-row items-center justify-between space-y-0 px-5 py-4">
                  <div>
                     <CardTitle className="text-sm">Effort by project</CardTitle>
                     <p className="mt-1 text-xs text-muted-foreground">
                        Estimated and actual workload in mandays.
                     </p>
                  </div>
                  <span className="text-xs text-muted-foreground">
                     Est {metrics.estimated} · Act {metrics.actual}
                  </span>
               </CardHeader>
               <CardContent className="h-[280px] px-2 pb-4 sm:px-4">
                  <ResponsiveContainer width="100%" height="100%">
                     <BarChart
                        data={effortData}
                        margin={{ top: 0, right: 16, left: -16, bottom: 0 }}
                     >
                        <CartesianGrid
                           strokeDasharray="3 3"
                           vertical={false}
                           className="stroke-border"
                        />
                        <XAxis
                           dataKey="name"
                           tickLine={false}
                           axisLine={false}
                           fontSize={11}
                           tickFormatter={(value) => String(value).slice(0, 12)}
                        />
                        <YAxis tickLine={false} axisLine={false} fontSize={11} />
                        <Tooltip
                           contentStyle={{
                              borderRadius: 8,
                              borderColor: 'var(--border)',
                              fontSize: 12,
                           }}
                           formatter={(value) => [`${value} mandays`, '']}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                        <Bar
                           dataKey="estimated"
                           name="Estimated"
                           fill="#8b5cf6"
                           radius={[4, 4, 0, 0]}
                        />
                        <Bar dataKey="actual" name="Actual" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                     </BarChart>
                  </ResponsiveContainer>
               </CardContent>
            </Card>
         </div>

         {(statusId !== 'all' || selectedDay) && (
            <Card className="gap-0 py-0 shadow-none">
               <CardHeader className="flex-row items-center justify-between space-y-0 px-5 py-4">
                  <div>
                     <CardTitle className="text-sm">Focused issues</CardTitle>
                     <p className="mt-1 text-xs text-muted-foreground">
                        {selectedDay
                           ? `Created or completed on ${fullDate(selectedDay)}.`
                           : 'Open issues matching the selected status.'}
                     </p>
                  </div>
                  <Button
                     size="xs"
                     variant="ghost"
                     onClick={() => {
                        setStatusId('all');
                        setSelectedDay(undefined);
                     }}
                  >
                     Clear focus
                  </Button>
               </CardHeader>
               <CardContent className="px-5 pb-4">
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                     {(selectedDay ? selectedDayIssues : filteredActive)
                        .slice(0, 12)
                        .map((issue) => (
                           <div key={issue.id} className="rounded-md border px-3 py-2.5">
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                 <span
                                    className="size-2 rounded-full"
                                    style={{ backgroundColor: issue.status.color }}
                                 />
                                 {issue.status.name}
                                 {issue.project?.name && (
                                    <span className="truncate">· {issue.project.name}</span>
                                 )}
                              </div>
                              <p className="mt-1 truncate text-sm font-medium">{issue.title}</p>
                           </div>
                        ))}
                     {(selectedDay ? selectedDayIssues : filteredActive).length === 0 && (
                        <p className="text-sm text-muted-foreground">No issues match this focus.</p>
                     )}
                  </div>
               </CardContent>
            </Card>
         )}
      </div>
   );
}
