'use client';

import { CapacityRing } from '@/components/common/cycles/capacity-ring';
import { IssuePeekPanel } from '@/components/common/issues/issue-peek-panel';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import type { Project } from '@/types/projects';
import { useProjectsDisplayStore } from '@/store/projects-display-store';
import {
   BIWEEKLY_DATES,
   LIST_WIDTH,
   MONTHS,
   offsetFor,
   offsetForTime,
   monthWidthOf,
   totalWidthOf,
   WEEKLY_DATES,
   ZOOM_LEVELS,
   type TimelineZoom,
} from '@/components/common/timeline/timeline-scale';
import { format, parseISO } from 'date-fns';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ProjectPeekPanel } from './project-peek-panel';
import { ProjectGroup } from './projects';

interface ProjectsTimelineProps {
   groups: ProjectGroup[];
}

const barBounds = (project: Project, monthWidth: number) => {
   const left = offsetFor(project.startDate, monthWidth);
   const right = Math.max(
      offsetFor(project.targetDate ?? project.startDate, monthWidth),
      left + 130
   );
   return { left, right };
};

const dateRangeLabel = (project: Project) => {
   const startLabel = format(parseISO(project.startDate), 'MMM d');
   if (!project.targetDate || project.targetDate === project.startDate) return startLabel;
   return `${startLabel} - ${format(parseISO(project.targetDate), 'MMM d')}`;
};

interface Viewport {
   left: number;
   width: number;
}

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** The fields an issue bar needs, as the project issue endpoint returns them. */
type TimelineIssue = {
   id: string;
   parentIssueId: string | null;
   identifier: string;
   title: string;
   createdAt: string;
   dueDate: string | null;
   status: { name: string; color: string };
   assignee: { name: string; avatarUrl: string | null } | null;
};

/**
 * An issue spans the days it is worked over: opened until due. Without a due
 * date there is no length to draw, so the bar keeps a readable minimum and
 * says so with a dashed edge.
 */
function IssueRow({
   issue,
   monthWidth,
   onSelect,
   nested = false,
   childCount = 0,
   expanded = false,
   onToggle,
}: {
   issue: TimelineIssue;
   monthWidth: number;
   onSelect: (issueId: string) => void;
   nested?: boolean;
   childCount?: number;
   expanded?: boolean;
   onToggle?: () => void;
}) {
   const start = issue.createdAt.slice(0, 10);
   const end = issue.dueDate?.slice(0, 10) ?? null;
   const left = offsetFor(start, monthWidth);
   const width = end ? Math.max(offsetFor(end, monthWidth) - left, 20) : 120;
   const label = `${format(parseISO(start), 'MMM d')}${end ? ` - ${format(parseISO(end), 'MMM d')}` : ''}`;

   return (
      <div className="relative h-8 flex items-center">
         <div className="absolute inset-0">
            <button
               type="button"
               onClick={() => onSelect(issue.id)}
               title={`${issue.identifier} · ${issue.title} - ${label}`}
               aria-label={`${issue.identifier} · ${issue.title} - ${label}`}
               className={cn(
                  'absolute top-1 h-6 rounded border transition-opacity hover:opacity-85',
                  !end && 'border-dashed'
               )}
               style={{
                  left,
                  width,
                  backgroundColor: issue.status.color,
                  borderColor: issue.status.color,
               }}
            >
               <span className="relative z-10 block truncate px-2 text-[11px] font-medium text-foreground drop-shadow-sm">
                  {issue.title}
               </span>
            </button>
         </div>
         <div
            className={cn(
               'sticky left-0 z-10 flex items-center gap-1.5 w-56 shrink-0 pr-4 h-8 bg-container/95 backdrop-blur-sm text-[11px] border-r border-border/40',
               nested ? 'pl-15' : 'pl-10'
            )}
         >
            {!nested &&
               (childCount > 0 ? (
                  <button
                     type="button"
                     aria-label={
                        expanded
                           ? `Hide sub-issues of ${issue.title}`
                           : `Show sub-issues of ${issue.title}`
                     }
                     aria-expanded={expanded}
                     onClick={onToggle}
                     className="text-muted-foreground hover:text-foreground"
                  >
                     <ChevronRight
                        className={cn('size-3.5 transition-transform', expanded && 'rotate-90')}
                     />
                  </button>
               ) : (
                  <span className="size-3.5 shrink-0" aria-hidden="true" />
               ))}
            <span className="text-muted-foreground shrink-0">{issue.identifier}</span>
            <span className="truncate flex-1 text-muted-foreground">{issue.title}</span>
            {issue.assignee && (
               <Avatar className="size-4 shrink-0">
                  <AvatarImage
                     src={issue.assignee.avatarUrl ?? undefined}
                     alt={issue.assignee.name}
                  />
                  <AvatarFallback>{issue.assignee.name[0]}</AvatarFallback>
               </Avatar>
            )}
         </div>
      </div>
   );
}

/** The issues of one opened project, indented under its bar. */
function ExpandedIssues({
   issues,
   loading,
   monthWidth,
   onSelect,
}: {
   issues?: TimelineIssue[];
   loading: boolean;
   monthWidth: number;
   onSelect: (issueId: string) => void;
}) {
   const [expandedParents, setExpandedParents] = useState<Set<string>>(new Set());
   if (loading || !issues) {
      return (
         <div className="sticky left-0 w-56 pl-10 pr-4 h-8 flex items-center text-[11px] text-muted-foreground">
            Loading issues...
         </div>
      );
   }
   if (issues.length === 0) {
      return (
         <div className="sticky left-0 w-56 pl-10 pr-4 h-8 flex items-center text-[11px] text-muted-foreground">
            No issues yet
         </div>
      );
   }
   const childrenByParent = new Map<string, TimelineIssue[]>();
   for (const issue of issues) {
      if (!issue.parentIssueId) continue;
      const children = childrenByParent.get(issue.parentIssueId) ?? [];
      children.push(issue);
      childrenByParent.set(issue.parentIssueId, children);
   }
   return (
      <>
         {issues
            .filter((issue) => !issue.parentIssueId)
            .map((issue) => {
               const children = childrenByParent.get(issue.id) ?? [];
               const expanded = expandedParents.has(issue.id);
               return (
                  <div key={issue.id}>
                     <IssueRow
                        issue={issue}
                        monthWidth={monthWidth}
                        onSelect={onSelect}
                        childCount={children.length}
                        expanded={expanded}
                        onToggle={() =>
                           setExpandedParents((current) => {
                              const next = new Set(current);
                              if (next.has(issue.id)) next.delete(issue.id);
                              else next.add(issue.id);
                              return next;
                           })
                        }
                     />
                     {expanded &&
                        children.map((child) => (
                           <IssueRow
                              key={child.id}
                              issue={child}
                              monthWidth={monthWidth}
                              onSelect={onSelect}
                              nested
                           />
                        ))}
                  </div>
               );
            })}
      </>
   );
}

/**
 * "← Jul 15 - Aug 28" indicator shown when a bar is outside the viewport.
 * Pinned with position: sticky (pure CSS) so it never drifts during fast
 * scrolling — JS is only used to decide which side to show.
 */
function OutOfViewIndicator({
   project,
   viewport,
   listOffset,
   monthWidth,
   onJump,
}: {
   project: Project;
   viewport: Viewport;
   listOffset: number;
   monthWidth: number;
   onJump: (contentX: number) => void;
}) {
   const { left, right } = barBounds(project, monthWidth);
   const visibleLeft = viewport.left + listOffset;
   const visibleRight = viewport.left + viewport.width;

   if (right >= visibleLeft + 4 && left <= visibleRight - 4) return null;

   const isPast = right < visibleLeft + 4;
   const label = dateRangeLabel(project);

   return (
      <button
         type="button"
         onClick={() => onJump(left)}
         className={cn(
            'sticky z-[6] flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap pointer-events-auto',
            !isPast && 'ml-auto'
         )}
         style={isPast ? { left: listOffset + 16 } : { right: 16 }}
      >
         {isPast && <ArrowLeft className="size-3.5" />}
         {label}
         {!isPast && <ArrowRight className="size-3.5" />}
      </button>
   );
}

function TimelineBar({
   project,
   monthWidth,
   selected,
   onSelect,
}: {
   project: Project;
   monthWidth: number;
   selected: boolean;
   onSelect: (projectId: string) => void;
}) {
   const left = offsetFor(project.startDate, monthWidth);
   const right = offsetFor(project.targetDate ?? project.startDate, monthWidth);
   const width = Math.max(right - left, 130);
   const completion = Math.min(Math.max(project.percentComplete, 0), 100);

   return (
      <div className="absolute inset-0">
         <button
            type="button"
            onClick={() => onSelect(project.id)}
            title={`${project.name} · ${completion}% complete · ${dateRangeLabel(project)}`}
            aria-label={`${project.name} · ${completion}% complete · ${dateRangeLabel(project)}`}
            className={cn(
               'absolute top-1 h-7 overflow-hidden rounded-md border bg-muted/35 transition-opacity hover:opacity-85',
               selected && 'border-violet-500 ring-1 ring-violet-500'
            )}
            style={{ left, width }}
         >
            <span
               aria-hidden="true"
               className="pointer-events-none absolute inset-y-0 left-0"
               style={{ width: `${completion}%`, backgroundColor: project.status.color }}
            />
            <span className="relative z-10 flex h-full min-w-0 items-center gap-1.5 px-2.5 text-xs font-medium text-foreground drop-shadow-sm">
               <span className="truncate">{project.name}</span>
               <span className="shrink-0">{completion}%</span>
            </span>
         </button>
      </div>
   );
}

/**
 * Projects "Timeline" view (the default): month scale, grouped rows,
 * date-positioned bars and a Today marker. The left project list, week
 * numbers and bar contents follow the Display options; the scale dropdown
 * (Year / Quarter / Month / Week, with Y/Q/M/W shortcuts) changes the zoom.
 */
export default function ProjectsTimeline({ groups }: ProjectsTimelineProps) {
   const { showProjectList, showWeekNumbers, displayProperties } = useProjectsDisplayStore();
   const [todayIso, setTodayIso] = useState<string | null>(null);
   const [viewport, setViewport] = useState<Viewport | null>(null);
   const [zoom, setZoom] = useState<TimelineZoom>('week');
   const [peekProjectId, setPeekProjectId] = useState<string | null>(null);
   const [peekIssueId, setPeekIssueId] = useState<string | null>(null);
   const [expanded, setExpanded] = useState<Set<string>>(new Set());
   const [issuesByProject, setIssuesByProject] = useState<Record<string, TimelineIssue[]>>({});
   const [loadingIssues, setLoadingIssues] = useState<Set<string>>(new Set());
   const [workspaceId, setWorkspaceId] = useState<string>();
   const scrollRef = useRef<HTMLDivElement>(null);
   const frameRef = useRef<number | null>(null);

   const monthWidth = monthWidthOf(zoom);
   const totalWidth = totalWidthOf(monthWidth);
   const listOffset = showProjectList ? LIST_WIDTH : 0;
   const todayOffset = todayIso !== null ? offsetFor(todayIso, monthWidth) : null;
   const todayLabel = todayIso !== null ? format(parseISO(todayIso), 'MMM d').toUpperCase() : null;
   /** The line would sit on the sticky project list → hide it (the pill stays on the scale). */
   const todayOverlapsList =
      viewport !== null && todayOffset !== null && todayOffset < viewport.left + listOffset + 28;
   /** Date labels: every other Monday zoomed out, every Monday zoomed in. */
   const scaleDates = zoom === 'year' ? BIWEEKLY_DATES : WEEKLY_DATES;

   const syncViewport = useCallback(() => {
      if (!scrollRef.current) return;
      setViewport({ left: scrollRef.current.scrollLeft, width: scrollRef.current.clientWidth });
   }, []);

   const handleScroll = useCallback(() => {
      if (frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(() => {
         frameRef.current = null;
         syncViewport();
      });
   }, [syncViewport]);

   useEffect(() => {
      const iso = new Date().toISOString().slice(0, 10);
      setTodayIso(iso);
      // Bring today into view on mount (a third from the left edge, but always
      // clear of the sticky project list so the line stays visible).
      if (scrollRef.current) {
         const offset = offsetFor(iso, monthWidthOf('week'));
         const listWidth = useProjectsDisplayStore.getState().showProjectList ? LIST_WIDTH : 0;
         const anchor = Math.max(scrollRef.current.clientWidth / 3, listWidth + 80);
         scrollRef.current.scrollLeft = Math.max(0, offset - anchor);
      }
      syncViewport();
      return () => {
         if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      };
   }, [syncViewport]);

   /** Change zoom while keeping the date at the middle of the viewport anchored. */
   const setZoomLevel = useCallback(
      (next: TimelineZoom) => {
         if (next === zoom) return;
         const element = scrollRef.current;
         setZoom(next);
         if (element) {
            const previousWidth = totalWidthOf(monthWidthOf(zoom));
            const nextWidth = totalWidthOf(monthWidthOf(next));
            const anchor = (element.scrollLeft + element.clientWidth / 2) / previousWidth;
            requestAnimationFrame(() => {
               element.scrollLeft = anchor * nextWidth - element.clientWidth / 2;
               syncViewport();
            });
         }
      },
      [zoom, syncViewport]
   );

   // Y / Q / M / W keyboard shortcuts (ignored while typing).
   useEffect(() => {
      const onKeyDown = (event: KeyboardEvent) => {
         if (event.metaKey || event.ctrlKey || event.altKey) return;
         const target = event.target as HTMLElement | null;
         if (
            target &&
            (target.tagName === 'INPUT' ||
               target.tagName === 'TEXTAREA' ||
               target.isContentEditable)
         ) {
            return;
         }
         const level = ZOOM_LEVELS.find(
            (candidate) => candidate.shortcut.toLowerCase() === event.key.toLowerCase()
         );
         if (level) setZoomLevel(level.id);
      };
      window.addEventListener('keydown', onKeyDown);
      return () => window.removeEventListener('keydown', onKeyDown);
   }, [setZoomLevel]);

   useEffect(() => {
      void loadCurrentWorkspace()
         .then((workspace) => setWorkspaceId(workspace.id))
         .catch(() => setWorkspaceId(undefined));
   }, []);

   /** Issues are fetched the first time a project is opened, then kept. */
   const toggleProject = useCallback(
      async (projectId: string) => {
         setExpanded((current) => {
            const next = new Set(current);
            if (next.has(projectId)) next.delete(projectId);
            else next.add(projectId);
            return next;
         });
         if (!workspaceId || issuesByProject[projectId]) return;
         setLoadingIssues((current) => new Set(current).add(projectId));
         try {
            const query = new URLSearchParams({ workspaceId });
            const response = await authenticatedFetch(
               `${api}/projects/${projectId}/issues?${query}`
            );
            if (!response.ok) throw new Error('Could not load project issues.');
            const payload = (await response.json()) as { data: TimelineIssue[] };
            setIssuesByProject((current) => ({ ...current, [projectId]: payload.data }));
         } catch {
            setIssuesByProject((current) => ({ ...current, [projectId]: [] }));
         } finally {
            setLoadingIssues((current) => {
               const next = new Set(current);
               next.delete(projectId);
               return next;
            });
         }
      },
      [issuesByProject, workspaceId]
   );

   const jumpTo = useCallback(
      (contentX: number) => {
         if (!scrollRef.current) return;
         const anchor = Math.max(scrollRef.current.clientWidth / 3, listOffset + 80);
         scrollRef.current.scrollTo({
            left: Math.max(0, contentX - anchor),
            behavior: 'smooth',
         });
      },
      [listOffset]
   );

   const scrollToToday = () => {
      if (scrollRef.current && todayOffset !== null) {
         // Land today clear of the sticky project list, so on small screens
         // the line never ends up hidden behind it.
         const anchor = Math.max(scrollRef.current.clientWidth / 3, listOffset + 80);
         scrollRef.current.scrollTo({
            left: Math.max(0, todayOffset - anchor),
            behavior: 'smooth',
         });
      }
   };

   return (
      <div className="relative w-full h-full">
         {peekProjectId !== null && (
            <ProjectPeekPanel projectId={peekProjectId} onClose={() => setPeekProjectId(null)} />
         )}
         {peekIssueId !== null && (
            <IssuePeekPanel issueId={peekIssueId} onClose={() => setPeekIssueId(null)} />
         )}
         {/* Floating scale controls (Linear-style) */}
         <div className="absolute top-1 right-4 z-30 flex items-center gap-1.5">
            <button
               type="button"
               onClick={scrollToToday}
               className="h-7 px-2.5 rounded-md border bg-container text-xs font-medium hover:bg-accent transition-colors shadow-xs"
            >
               Today
            </button>
            <DropdownMenu>
               <DropdownMenuTrigger className="h-7 px-2.5 rounded-md border bg-container text-xs font-medium hover:bg-accent transition-colors shadow-xs inline-flex items-center gap-1 outline-none">
                  {ZOOM_LEVELS.find((level) => level.id === zoom)!.label}
                  <ChevronDown className="size-3 text-muted-foreground" />
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end" className="w-40">
                  {ZOOM_LEVELS.map((level) => (
                     <DropdownMenuItem
                        key={level.id}
                        onClick={() => setZoomLevel(level.id)}
                        className="flex items-center gap-2 text-sm"
                     >
                        <span className="flex-1">{level.label}</span>
                        {zoom === level.id && <Check className="size-3.5" />}
                        <span className="text-xs text-muted-foreground">{level.shortcut}</span>
                     </DropdownMenuItem>
                  ))}
               </DropdownMenuContent>
            </DropdownMenu>
         </div>

         <div ref={scrollRef} onScroll={handleScroll} className="w-full h-full overflow-auto">
            <div style={{ width: totalWidth }} className="relative min-h-full">
               {/* Month scale: month names, weekly ticks and date labels */}
               <div className="sticky top-0 z-20 border-b bg-container select-none">
                  <div className="relative flex">
                     {MONTHS.map((month) => (
                        <div
                           key={month.key}
                           style={{ width: monthWidth }}
                           className="shrink-0 px-2 pt-1.5 pb-0.5 text-[11px] font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap overflow-hidden"
                        >
                           {month.label}
                        </div>
                     ))}
                     {/* Weekly tick marks */}
                     <div className="absolute inset-x-0 bottom-0 pointer-events-none">
                        {WEEKLY_DATES.map((date) => (
                           <span
                              key={date.time}
                              className="absolute bottom-0 h-1 w-px bg-muted-foreground/30"
                              style={{ left: offsetForTime(date.time, monthWidth) }}
                           />
                        ))}
                     </div>
                  </div>
                  {/* Date labels (every other Monday at the Year zoom, weekly beyond) */}
                  <div className="relative h-5">
                     {scaleDates.map((date) => {
                        const left = offsetForTime(date.time, monthWidth);
                        if (todayOffset !== null && Math.abs(left - todayOffset) < 30) return null;
                        return (
                           <span
                              key={date.time}
                              className="absolute top-0 -translate-x-1/2 text-[10px] text-muted-foreground/80 whitespace-nowrap"
                              style={{ left }}
                           >
                              {showWeekNumbers ? `W${date.week}` : date.day}
                           </span>
                        );
                     })}
                     {/* Today pill, pinned to the scale */}
                     {todayOffset !== null && (
                        <span
                           className="absolute -top-0.5 -translate-x-1/2 text-[10px] font-semibold bg-violet-500 text-white rounded-full px-1.5 py-px uppercase whitespace-nowrap pointer-events-none z-10"
                           style={{ left: todayOffset }}
                        >
                           {todayLabel}
                        </span>
                     )}
                  </div>
               </div>

               {/* Month grid lines */}
               <div className="absolute inset-0 top-7 flex pointer-events-none">
                  {MONTHS.map((month) => (
                     <div
                        key={month.key}
                        style={{ width: monthWidth }}
                        className="shrink-0 border-r border-border/25 h-full"
                     />
                  ))}
               </div>

               {/* Today marker (hidden while it overlaps the sticky project list) */}
               {todayOffset !== null && !todayOverlapsList && (
                  <div
                     className="absolute top-7 bottom-0 w-px bg-violet-500 z-10"
                     style={{ left: todayOffset }}
                  />
               )}

               {/* Groups */}
               <div className="relative z-[5] pb-8">
                  {groups.map((group) => (
                     <div key={group.id}>
                        <div className="sticky left-0 flex items-center gap-2 px-4 h-9 text-sm font-medium bg-[color-mix(in_oklab,var(--accent)_30%,var(--container))] border-y border-border/40 w-screen max-w-full">
                           {group.icon && <span>{group.icon}</span>}
                           {group.name}
                           <span className="text-xs text-muted-foreground">
                              {group.projects.length}
                           </span>
                           <button className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
                              <Plus className="size-3.5" />
                           </button>
                        </div>
                        <div className="py-1">
                           {group.projects.map((project) => (
                              <div key={project.id}>
                                 <div className="relative h-9 flex items-center">
                                    <TimelineBar
                                       project={project}
                                       monthWidth={monthWidth}
                                       selected={peekProjectId === project.id}
                                       onSelect={(projectId) => {
                                          setPeekIssueId(null);
                                          setPeekProjectId((current) =>
                                             current === projectId ? null : projectId
                                          );
                                       }}
                                    />
                                    {showProjectList && (
                                       <div className="sticky left-0 z-10 flex items-center gap-1.5 w-56 shrink-0 pl-1 pr-4 h-9 bg-container/95 backdrop-blur-sm text-xs border-r border-border/40">
                                          <button
                                             type="button"
                                             aria-label={
                                                expanded.has(project.id)
                                                   ? `Hide issues of ${project.name}`
                                                   : `Show issues of ${project.name}`
                                             }
                                             aria-expanded={expanded.has(project.id)}
                                             onClick={() => void toggleProject(project.id)}
                                             className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                                          >
                                             <ChevronRight
                                                className={cn(
                                                   'size-3.5 transition-transform',
                                                   expanded.has(project.id) && 'rotate-90'
                                                )}
                                             />
                                          </button>
                                          <span className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0">
                                             <project.icon className="size-3" />
                                          </span>
                                          <span className="truncate flex-1">{project.name}</span>
                                          {displayProperties.health && (
                                             <span
                                                className="size-2 rounded-full shrink-0"
                                                style={{ backgroundColor: project.health.color }}
                                             />
                                          )}
                                          {displayProperties.status && (
                                             <CapacityRing
                                                value={project.percentComplete}
                                                color="#6771c5"
                                             />
                                          )}
                                          {displayProperties.priority && (
                                             <project.priority.icon
                                                className={cn(
                                                   'size-3 shrink-0 text-muted-foreground'
                                                )}
                                             />
                                          )}
                                          {displayProperties.lead && (
                                             <Avatar className="size-4 shrink-0">
                                                <AvatarImage
                                                   src={project.lead.avatarUrl}
                                                   alt={project.lead.name}
                                                />
                                                <AvatarFallback>
                                                   {project.lead.name[0]}
                                                </AvatarFallback>
                                             </Avatar>
                                          )}
                                       </div>
                                    )}
                                    {viewport && (
                                       <OutOfViewIndicator
                                          project={project}
                                          viewport={viewport}
                                          listOffset={listOffset}
                                          monthWidth={monthWidth}
                                          onJump={jumpTo}
                                       />
                                    )}
                                 </div>
                                 {expanded.has(project.id) && (
                                    <ExpandedIssues
                                       issues={issuesByProject[project.id]}
                                       loading={loadingIssues.has(project.id)}
                                       monthWidth={monthWidth}
                                       onSelect={(issueId) => {
                                          setPeekProjectId(null);
                                          setPeekIssueId((current) =>
                                             current === issueId ? null : issueId
                                          );
                                       }}
                                    />
                                 )}
                              </div>
                           ))}
                        </div>
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </div>
   );
}
