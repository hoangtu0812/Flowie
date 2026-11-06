'use client';

import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { Check, ChevronDown } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
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
} from './timeline-scale';

/**
 * Scrollable timeline canvas shared by the project and sub-issue timelines: a toolbar with Today
 * and the zoom menu, the month scale with weekly ticks and day labels, month grid lines and the
 * today line. Rows come from `children(monthWidth)` so every row is placed on the current zoom;
 * each row keeps its own sticky label column. It opens scrolled to `focusIso` (default today)
 * without animation. `className` sizes the frame (the project tab fills its page, the sub-issue
 * section uses a bounded height).
 * VI: Khung timeline cuộn được, dùng chung cho timeline project và sub-issue: thanh công cụ có
 * VI: Today và menu zoom, thang tháng với vạch tuần và nhãn ngày, đường lưới tháng và vạch hôm nay.
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

   const monthWidth = monthWidthOf(zoom);
   const totalWidth = totalWidthOf(monthWidth);
   const scaleDates = zoom === 'year' ? BIWEEKLY_DATES : WEEKLY_DATES;
   const todayOffset = todayIso ? offsetFor(todayIso, monthWidth) : null;
   const todayLabel = todayIso ? format(parseISO(todayIso), 'MMM d').toUpperCase() : null;

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
                     className="absolute top-7 bottom-0 w-px bg-violet-500 z-10 pointer-events-none"
                     style={{ left: todayOffset }}
                  />
               )}

               <div className="relative z-[5] pb-8">{children(monthWidth)}</div>
            </div>
         </div>
      </div>
   );
}
