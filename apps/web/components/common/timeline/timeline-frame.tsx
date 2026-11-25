'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { LocateFixed } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
   BIWEEKLY_DATES,
   DAILY_DATES,
   DAY_MS,
   dayWidthOf,
   MONTHS,
   monthWidthOf,
   offsetFor,
   offsetForTime,
   totalWidthOf,
   WEEKLY_DATES,
   ZOOM_LEVELS,
   type TimelineZoom,
} from './timeline-scale';

/**
 * Scrollable timeline canvas shared by the project and sub-issue timelines: a toolbar with Today
 * and the Day/Week/Month/Quarter/Year switch, the month scale with weekly ticks and day labels,
 * month grid lines, shaded weekends (once a day is wide enough to see) and the labelled today line. Rows come from `children(monthWidth)` so every row is placed on the current zoom;
 * each row keeps its own sticky label column. It opens scrolled to `focusIso` (default today)
 * without animation. `className` sizes the frame (the project tab fills its page, the sub-issue
 * section uses a bounded height).
 * VI: Khung timeline cuộn được, dùng chung cho timeline project và sub-issue: thanh công cụ có
 * VI: Today và nút chuyển Day/Week/Month/Quarter/Year, thang tháng với vạch tuần và nhãn ngày,
 * VI: đường lưới tháng, cuối tuần tô nhạt (khi một ngày đủ rộng để thấy) và vạch hôm nay có nhãn.
 * VI: Các hàng lấy từ `children(monthWidth)` để mọi hàng đặt theo mức zoom hiện tại; mỗi hàng tự
 * VI: giữ cột nhãn sticky của nó. Khi mở, khung cuộn tới `focusIso` (mặc định hôm nay) không hiệu
 * VI: ứng. `className` đặt kích thước khung (tab project chiếm cả trang, khu sub-issue có chiều cao
 * VI: giới hạn).
 */
export function TimelineFrame({
   children,
   defaultZoom = 'week',
   focusIso,
   toolbarStart,
   className,
}: {
   children: (monthWidth: number) => ReactNode;
   defaultZoom?: TimelineZoom;
   focusIso?: string;
   toolbarStart?: ReactNode;
   className?: string;
}) {
   const [zoom, setZoom] = useState<TimelineZoom>(defaultZoom);
   const [todayIso, setTodayIso] = useState<string | null>(null);
   const scrollRef = useRef<HTMLDivElement>(null);
   /** Share of the range at the view's centre before a zoom change. VI: Vị trí giữa khung trước khi đổi zoom. */
   const zoomAnchor = useRef<number | null>(null);

   const monthWidth = monthWidthOf(zoom);
   const totalWidth = totalWidthOf(monthWidth);
   const dayWidth = dayWidthOf(monthWidth);
   const scaleDates =
      zoom === 'year' ? BIWEEKLY_DATES : zoom === 'day' ? DAILY_DATES : WEEKLY_DATES;
   const todayOffset = todayIso ? offsetFor(todayIso, monthWidth) : null;
   const todayLabel = todayIso ? format(parseISO(todayIso), 'EEE, MMM d') : null;

   const scrollToOffset = useCallback((offset: number, smooth = true) => {
      const element = scrollRef.current;
      if (!element) return;
      const anchor = Math.max(element.clientWidth / 3, 300);
      element.scrollTo({
         left: Math.max(0, offset - anchor),
         behavior: smooth ? 'smooth' : 'auto',
      });
   }, []);

   // A zoom change keeps the date at the centre of the view where it was (the scale is linear).
   // VI: Đổi zoom giữ ngày ở giữa khung nhìn tại chỗ cũ (thang thời gian tuyến tính).
   const changeZoom = (next: TimelineZoom) => {
      const element = scrollRef.current;
      if (element) zoomAnchor.current = (element.scrollLeft + element.clientWidth / 2) / totalWidth;
      setZoom(next);
   };
   useLayoutEffect(() => {
      const element = scrollRef.current;
      if (!element || zoomAnchor.current === null) return;
      element.scrollLeft = zoomAnchor.current * totalWidth - element.clientWidth / 2;
      zoomAnchor.current = null;
   }, [totalWidth]);

   useEffect(() => {
      const iso = new Date().toISOString().slice(0, 10);
      setTodayIso(iso);
      // Open where the work is rather than in 2020, without an animation.
      // VI: Mở ở nơi có công việc thay vì năm 2020, không hiệu ứng.
      scrollToOffset(offsetFor(focusIso ?? iso, monthWidthOf(defaultZoom)), false);
      // Only the first render positions the view; later data changes keep the user's scroll.
      // VI: Chỉ lần render đầu đặt vị trí; dữ liệu đổi sau đó giữ nguyên vị trí người dùng cuộn.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [scrollToOffset]);

   return (
      <div className={cn('w-full flex flex-col overflow-hidden', className)}>
         <div className="flex items-center justify-end gap-2 px-6 h-10 border-b shrink-0">
            {toolbarStart}
            <div
               role="radiogroup"
               aria-label="Timeline scale"
               className="flex items-center rounded-md bg-muted p-0.5"
            >
               {/* Finest scale first, like Day / Week / Month in calendar apps. */}
               {[...ZOOM_LEVELS].reverse().map((level) => (
                  <button
                     key={level.id}
                     type="button"
                     role="radio"
                     aria-checked={level.id === zoom}
                     onClick={() => changeZoom(level.id)}
                     className={cn(
                        'h-6 rounded px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        level.id === zoom && 'bg-container text-foreground shadow-xs'
                     )}
                  >
                     {level.label}
                  </button>
               ))}
            </div>
            <Button
               size="xs"
               variant="outline"
               className="gap-1"
               onClick={() => todayOffset !== null && scrollToOffset(todayOffset)}
            >
               <LocateFixed className="size-3.5" />
               Today
            </Button>
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
                        // Day labels sit in the middle of their day. VI: Nhãn ngày nằm giữa ngày.
                        if (zoom === 'day') {
                           return (
                              <span
                                 key={date.time}
                                 className="absolute top-0 -translate-x-1/2 text-[10px] text-muted-foreground/80"
                                 style={{ left: left + dayWidth / 2 }}
                              >
                                 {date.day}
                              </span>
                           );
                        }
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
                           className="absolute -top-0.5 -translate-x-1/2 text-[10px] font-semibold bg-foreground text-background rounded-full px-1.5 py-px whitespace-nowrap pointer-events-none z-10"
                           style={{ left: todayOffset }}
                           title={todayLabel ?? undefined}
                        >
                           Today
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

               {/* Weekends, once a day is wide enough to tell apart. VI: Cuối tuần, khi một ngày đủ rộng. */}
               {dayWidth >= 10 && (
                  <div className="absolute inset-0 top-7 pointer-events-none" aria-hidden="true">
                     {WEEKLY_DATES.map((date) => (
                        <span
                           key={date.time}
                           className="absolute inset-y-0 bg-muted/60"
                           style={{
                              left: offsetForTime(date.time + 5 * DAY_MS, monthWidth),
                              width: 2 * dayWidth,
                           }}
                        />
                     ))}
                  </div>
               )}

               {todayOffset !== null && (
                  <div
                     className="absolute top-7 bottom-0 w-px bg-foreground/70 z-10 pointer-events-none"
                     style={{ left: todayOffset }}
                  />
               )}

               <div className="relative z-[5] pb-8">{children(monthWidth)}</div>
            </div>
         </div>
      </div>
   );
}
