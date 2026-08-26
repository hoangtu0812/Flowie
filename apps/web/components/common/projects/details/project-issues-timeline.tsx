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
   LIST_WIDTH,
   MONTHS,
   monthWidthOf,
   offsetFor,
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
const MIN_BAR_WIDTH = 120;
const ROW_HEIGHT = 36;

type TimelineIssue = Issue;

/**
 * An issue occupies the span it was worked over: from the day it was opened to
 * the day it is due. Without a due date there is nothing to draw a length
 * from, so the bar keeps the minimum width and is marked as open-ended.
 */
function span(issue: TimelineIssue): { start: string; end: string | null } {
   return { start: issue.createdAt.slice(0, 10), end: issue.dueDate?.slice(0, 10) ?? null };
}

function rangeLabel(issue: TimelineIssue): string {
   const { start, end } = span(issue);
   const startLabel = format(parseISO(start), 'MMM d');
   return end && end !== start ? `${startLabel} – ${format(parseISO(end), 'MMM d')}` : startLabel;
}

function IssueBar({
   issue,
   monthWidth,
   href,
}: {
   issue: TimelineIssue;
   monthWidth: number;
   href: string;
}) {
   const { start, end } = span(issue);
   const left = offsetFor(start, monthWidth);
   const width = Math.max(offsetFor(end ?? start, monthWidth) - left, MIN_BAR_WIDTH);

   return (
      <div className="absolute inset-0">
         <Link
            href={href}
            title={`${issue.identifier} · ${issue.title} — ${rangeLabel(issue)}`}
            className={cn(
               'absolute top-1 h-7 flex items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors overflow-hidden',
               'bg-accent/40 hover:bg-accent',
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
 * Project "Timeline" tab: every issue of the project as a bar on the same
 * month scale the Projects timeline uses, grouped by status.
 */
export function ProjectIssuesTimeline({ issues }: { issues: TimelineIssue[] }) {
   const { orgId } = useParams<{ orgId: string }>();
   const [zoom, setZoom] = useState<TimelineZoom>('year');
   const [todayIso, setTodayIso] = useState<string | null>(null);
   const scrollRef = useRef<HTMLDivElement>(null);

   const monthWidth = monthWidthOf(zoom);
   const totalWidth = totalWidthOf(monthWidth);
   const scaleDates = zoom === 'year' ? BIWEEKLY_DATES : WEEKLY_DATES;
   const todayOffset = todayIso ? offsetFor(todayIso, monthWidth) : null;

   const groups = useMemo(() => {
      const byStatus = new Map<string, { name: string; color: string; issues: TimelineIssue[] }>();
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

   const scrollToOffset = useCallback((offset: number) => {
      const element = scrollRef.current;
      if (!element) return;
      const anchor = Math.max(element.clientWidth / 3, LIST_WIDTH + 80);
      element.scrollTo({ left: Math.max(0, offset - anchor), behavior: 'smooth' });
   }, []);

   useEffect(() => {
      const iso = new Date().toISOString().slice(0, 10);
      setTodayIso(iso);
      const element = scrollRef.current;
      if (!element) return;
      // Land on today without a transition on mount, so the view opens where
      // the work is rather than in 2020.
      const anchor = Math.max(element.clientWidth / 3, LIST_WIDTH + 80);
      element.scrollLeft = Math.max(0, offsetFor(iso, monthWidthOf('year')) - anchor);
   }, []);

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

         <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto relative">
            <div style={{ width: totalWidth + LIST_WIDTH }} className="relative">
               {/* Month scale */}
               <div className="sticky top-0 z-20 flex h-10 bg-container border-b">
                  <div
                     className="sticky left-0 z-10 shrink-0 bg-container border-r"
                     style={{ width: LIST_WIDTH }}
                  />
                  <div className="relative" style={{ width: totalWidth }}>
                     {MONTHS.map((month, index) => (
                        <div
                           key={month.key}
                           className="absolute top-0 h-full flex items-center border-l text-xs text-muted-foreground pl-2"
                           style={{ left: index * monthWidth, width: monthWidth }}
                        >
                           {month.label}
                        </div>
                     ))}
                     {scaleDates.map((date) => (
                        <span
                           key={date.time}
                           className="absolute bottom-0.5 text-[10px] text-muted-foreground/70"
                           style={{
                              left: offsetFor(new Date(date.time).toISOString(), monthWidth) + 2,
                           }}
                        >
                           {date.day}
                        </span>
                     ))}
                     {todayOffset !== null && (
                        <span
                           className="absolute bottom-0.5 -translate-x-1/2 rounded px-1.5 py-px text-[10px] font-medium bg-violet-600 text-white"
                           style={{ left: todayOffset }}
                        >
                           {format(parseISO(todayIso!), 'MMM d').toUpperCase()}
                        </span>
                     )}
                  </div>
               </div>

               {/* Rows */}
               <div className="relative">
                  {todayOffset !== null && (
                     <div
                        className="absolute top-0 bottom-0 w-px bg-violet-600/70 z-[5] pointer-events-none"
                        style={{ left: LIST_WIDTH + todayOffset }}
                     />
                  )}
                  {groups.map((group) => (
                     <div key={group.name}>
                        <div className="flex items-center h-9 sticky left-0 z-[6] bg-container/95 border-b">
                           <div
                              className="flex items-center gap-2 px-3 text-sm font-medium"
                              style={{ width: LIST_WIDTH }}
                           >
                              <span
                                 className="size-2.5 rounded-full"
                                 style={{ backgroundColor: group.color }}
                              />
                              <span className="truncate">{group.name}</span>
                              <span className="text-xs text-muted-foreground">
                                 {group.issues.length}
                              </span>
                           </div>
                        </div>
                        {group.issues.map((issue) => (
                           <div
                              key={issue.id}
                              className="flex border-b border-border/40 hover:bg-sidebar/40"
                              style={{ height: ROW_HEIGHT }}
                           >
                              <div
                                 className="sticky left-0 z-[6] shrink-0 flex items-center gap-2 px-3 bg-container border-r"
                                 style={{ width: LIST_WIDTH }}
                              >
                                 <issue.priority.icon className="size-3.5 text-muted-foreground shrink-0" />
                                 <span className="text-[11px] text-muted-foreground shrink-0">
                                    {issue.identifier}
                                 </span>
                                 <span className="text-xs truncate">{issue.title}</span>
                              </div>
                              <div className="relative" style={{ width: totalWidth }}>
                                 <IssueBar
                                    issue={issue}
                                    monthWidth={monthWidth}
                                    href={`/${orgId}/issue/${issue.identifier}`}
                                 />
                              </div>
                           </div>
                        ))}
                     </div>
                  ))}
               </div>
            </div>
         </div>
      </div>
   );
}
