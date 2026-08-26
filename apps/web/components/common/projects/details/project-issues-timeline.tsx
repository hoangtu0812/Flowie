'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
   BIWEEKLY_DATES,
   MONTHS,
   monthWidthOf,
   offsetFor,
   offsetForTime,
   totalWidthOf,
   WEEKLY_DATES,
   ZOOM_LEVELS,
   type TimelineZoom,
} from '@/components/common/timeline/timeline-scale';
import { cn } from '@/lib/utils';
import type { Issue } from '@/mock-data/issues';
import { format, parseISO } from 'date-fns';
import { Check, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/** A bar narrower than this is unreadable, so it is the floor for every issue. */
const MIN_BAR_WIDTH = 130;

/**
 * An issue occupies the span it is worked over: from the day it was opened to
 * the day it is due. Without a due date there is no length to draw, so the bar
 * keeps the minimum width and says so with a dashed edge.
 */
function span(issue: Issue): { start: string; end: string | null } {
   return { start: issue.createdAt.slice(0, 10), end: issue.dueDate?.slice(0, 10) ?? null };
}

function rangeLabel(issue: Issue): string {
   const { start, end } = span(issue);
   const startLabel = format(parseISO(start), 'MMM d');
   return end && end !== start ? `${startLabel} – ${format(parseISO(end), 'MMM d')}` : startLabel;
}

function IssueBar({ issue, monthWidth, href }: { issue: Issue; monthWidth: number; href: string }) {
   const { start, end } = span(issue);
   const left = offsetFor(start, monthWidth);
   const width = Math.max(offsetFor(end ?? start, monthWidth) - left, MIN_BAR_WIDTH);

   return (
      <div className="absolute inset-0">
         <Link
            href={href}
            title={`${issue.identifier} · ${issue.title} — ${rangeLabel(issue)}`}
            className={cn(
               'absolute top-1 h-7 flex items-center gap-1.5 rounded-md border bg-accent/40 hover:bg-accent px-2.5 text-xs transition-colors overflow-hidden',
               !end && 'border-dashed'
            )}
            style={{ left, width }}
         >
            <span
               className="size-2 rounded-full shrink-0"
               style={{ backgroundColor: issue.status.color }}
            />
            <span className="truncate font-medium">{issue.title}</span>
            {issue.assignee && (
               <Avatar className="size-4 shrink-0 ml-auto">
                  <AvatarImage src={issue.assignee.avatarUrl} alt={issue.assignee.name} />
                  <AvatarFallback>{issue.assignee.name[0]}</AvatarFallback>
               </Avatar>
            )}
         </Link>
      </div>
   );
}

/**
 * Project "Timeline" tab: the project's issues on the same month scale the
 * Projects timeline uses, so the two screens read as one instrument.
 */
export function ProjectIssuesTimeline({ issues }: { issues: Issue[] }) {
   const { orgId } = useParams<{ orgId: string }>();
   const [zoom, setZoom] = useState<TimelineZoom>('year');
   const [todayIso, setTodayIso] = useState<string | null>(null);
   const scrollRef = useRef<HTMLDivElement>(null);

   const monthWidth = monthWidthOf(zoom);
   const totalWidth = totalWidthOf(monthWidth);
   const scaleDates = zoom === 'year' ? BIWEEKLY_DATES : WEEKLY_DATES;
   const todayOffset = todayIso ? offsetFor(todayIso, monthWidth) : null;
   const todayLabel = todayIso ? format(parseISO(todayIso), 'MMM d').toUpperCase() : null;

   const groups = useMemo(() => {
      const byStatus = new Map<string, { name: string; color: string; issues: Issue[] }>();
      for (const issue of issues) {
         const group = byStatus.get(issue.status.id) ?? {
            name: issue.status.name,
            color: issue.status.color,
            issues: [],
         };
         group.issues.push(issue);
         byStatus.set(issue.status.id, group);
      }
      for (const group of byStatus.values()) {
         group.issues.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }
      return [...byStatus.values()];
   }, [issues]);

   const scrollToOffset = useCallback((offset: number, smooth = true) => {
      const element = scrollRef.current;
      if (!element) return;
      const anchor = Math.max(element.clientWidth / 3, 300);
      element.scrollTo({
         left: Math.max(0, offset - anchor),
         behavior: smooth ? 'smooth' : 'auto',
      });
   }, []);

   useEffect(() => {
      const iso = new Date().toISOString().slice(0, 10);
      setTodayIso(iso);
      // Open where the work is rather than in 2020, without an animation.
      scrollToOffset(offsetFor(iso, monthWidthOf('year')), false);
   }, [scrollToOffset]);

   if (issues.length === 0) {
      return (
         <div className="h-full grid place-items-center text-sm text-muted-foreground">
            No issues to place on the timeline yet.
         </div>
      );
   }

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <div className="flex items-center justify-end gap-2 px-6 h-10 border-b shrink-0">
            <Button
               size="xs"
               variant="ghost"
               onClick={() => todayOffset !== null && scrollToOffset(todayOffset)}
            >
               Today
            </Button>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <Button size="xs" variant="outline" className="gap-1">
                     {ZOOM_LEVELS.find((level) => level.id === zoom)?.label}
                     <ChevronDown className="size-3.5" />
                  </Button>
               </DropdownMenuTrigger>
               <DropdownMenuContent align="end">
                  {ZOOM_LEVELS.map((level) => (
                     <DropdownMenuItem key={level.id} onClick={() => setZoom(level.id)}>
                        {level.label}
                        {level.id === zoom && <Check className="ml-auto size-4" />}
                     </DropdownMenuItem>
                  ))}
               </DropdownMenuContent>
            </DropdownMenu>
         </div>

         <div ref={scrollRef} className="w-full flex-1 min-h-0 overflow-auto">
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
                  <div className="relative h-5">
                     {scaleDates.map((date) => {
                        const left = offsetForTime(date.time, monthWidth);
                        // The today pill owns this stretch of the scale.
                        if (todayOffset !== null && Math.abs(left - todayOffset) < 30) return null;
                        return (
                           <span
                              key={date.time}
                              className="absolute top-0 -translate-x-1/2 text-[10px] text-muted-foreground/80 whitespace-nowrap"
                              style={{ left }}
                           >
                              {date.day}
                           </span>
                        );
                     })}
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

               {todayOffset !== null && (
                  <div
                     className="absolute top-7 bottom-0 w-px bg-violet-500 z-10"
                     style={{ left: todayOffset }}
                  />
               )}

               <div className="relative z-[5] pb-8">
                  {groups.map((group) => (
                     <div key={group.name}>
                        <div className="sticky left-0 flex items-center gap-2 px-4 h-9 text-sm font-medium bg-[color-mix(in_oklab,var(--accent)_30%,var(--container))] border-y border-border/40 w-screen max-w-full">
                           <span
                              className="size-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: group.color }}
                           />
                           {group.name}
                           <span className="text-xs text-muted-foreground">
                              {group.issues.length}
                           </span>
                        </div>
                        <div className="py-1">
                           {group.issues.map((issue) => (
                              <div key={issue.id} className="relative h-9 flex items-center">
                                 <IssueBar
                                    issue={issue}
                                    monthWidth={monthWidth}
                                    href={`/${orgId}/issue/${issue.identifier}`}
                                 />
                                 <div className="sticky left-0 z-10 flex items-center gap-1.5 w-56 shrink-0 px-4 h-9 bg-container/95 backdrop-blur-sm text-xs border-r border-border/40">
                                    <issue.priority.icon className="size-3.5 shrink-0 text-muted-foreground" />
                                    <span className="text-muted-foreground shrink-0">
                                       {issue.identifier}
                                    </span>
                                    <span className="truncate flex-1">{issue.title}</span>
                                    {issue.assignee && (
                                       <Avatar className="size-4 shrink-0">
                                          <AvatarImage
                                             src={issue.assignee.avatarUrl}
                                             alt={issue.assignee.name}
                                          />
                                          <AvatarFallback>{issue.assignee.name[0]}</AvatarFallback>
                                       </Avatar>
                                    )}
                                 </div>
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
