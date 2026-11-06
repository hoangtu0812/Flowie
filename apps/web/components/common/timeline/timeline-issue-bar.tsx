'use client';

import { cn } from '@/lib/utils';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { addDays, barGeometry, type DragMode, dragSchedule } from './timeline-scale';

/** Dates and save callback that make a bar draggable. VI: Ngày và hàm lưu giúp thanh kéo được. */
export type BarSchedule = {
   /** Bar start and end as `YYYY-MM-DD` (`end` null for a dashed bar). */
   start: string;
   end: string | null;
   monthWidth: number;
   dayWidth: number;
   /** Resolves true once saved; false puts the bar back. VI: true khi đã lưu; false trả thanh về. */
   onChange: (start: string, end: string | null) => Promise<boolean>;
};

/**
 * One issue on a timeline row, shared by the Project, Initiative and sub-issue timelines so every
 * screen draws the same bar: a container-coloured fill outlined in the status colour, readable text
 * in both themes, a dashed edge when the issue has no end date, and a hover fill. `left` and
 * `width` are pixel offsets from the timeline scale; `label` is the accessible description
 * (identifier, title and date range). `warning` adds an amber outline (a sub-issue outside its
 * parent's dates).
 *
 * With `schedule` the bar can be dragged: the body moves the whole range, the 6 px handles on each
 * edge move the start or the end. Pixels become whole days (snap per day) and `dragSchedule` keeps
 * the end on or after the start. The new position stays while `onChange` saves and until the
 * parent passes the saved dates; a failed save puts the bar back. A drag that ends on the same day
 * is a click; a real drag swallows the click that follows it. Keyboard users open the issue with
 * Enter and change dates in its date fields.
 * VI: Một issue trên dòng timeline, dùng chung cho timeline Project, Initiative và sub-issue để mọi
 * VI: màn hình vẽ cùng một kiểu thanh: nền màu container, viền theo màu trạng thái, chữ đọc rõ ở cả
 * VI: hai theme, viền nét đứt khi issue chưa có ngày kết thúc, và đổi nền khi hover. `left` và
 * VI: `width` là toạ độ pixel theo thang timeline; `label` là mô tả cho trình đọc màn hình (mã, tiêu
 * VI: đề và khoảng ngày). `warning` thêm viền cam (sub-issue nằm ngoài khoảng ngày của cha).
 * VI:
 * VI: Có `schedule` thì thanh kéo được: thân thanh dời cả khoảng, tay nắm 6 px ở mỗi mép dời ngày
 * VI: bắt đầu hoặc kết thúc. Pixel được đổi thành ngày nguyên (snap theo ngày) và `dragSchedule`
 * VI: giữ ngày kết thúc không trước ngày bắt đầu. Vị trí mới được giữ trong lúc `onChange` lưu và
 * VI: đến khi cha truyền xuống ngày đã lưu; lưu lỗi thì thanh về chỗ cũ. Kéo mà vẫn cùng ngày được
 * VI: coi là bấm; kéo thật thì bỏ qua cú click ngay sau đó. Người dùng bàn phím mở issue bằng Enter
 * VI: và đổi ngày ở các ô ngày của issue.
 */
export function TimelineIssueBar({
   left,
   width,
   color,
   dashed,
   title,
   label,
   onClick,
   warning = false,
   schedule,
}: {
   left: number;
   width: number;
   color: string;
   dashed: boolean;
   title: string;
   label: string;
   onClick: () => void;
   warning?: boolean;
   schedule?: BarSchedule;
}) {
   const [drag, setDrag] = useState<{ mode: DragMode; originX: number; days: number } | null>(null);
   const [pending, setPending] = useState<{ start: string; end: string | null } | null>(null);
   const swallowClick = useRef(false);
   const start = schedule?.start;
   const end = schedule?.end;

   // New dates from the parent mean the save landed (or data reloaded): drop the local position.
   // VI: Ngày mới từ cha nghĩa là đã lưu xong (hoặc dữ liệu đã tải lại): bỏ vị trí tạm.
   useEffect(() => setPending(null), [start, end]);

   // Under the right edge of a dashed bar sits the end date a resize from that edge starts from.
   // VI: Dưới mép phải của thanh nét đứt là ngày kết thúc mà thao tác kéo mép đó bắt đầu từ.
   const spanFor = (mode: DragMode, current: BarSchedule) => ({
      start: current.start,
      end:
         current.end ??
         (mode === 'end' ? addDays(current.start, Math.round(width / current.dayWidth)) : null),
   });
   const preview =
      schedule && drag ? dragSchedule(spanFor(drag.mode, schedule), drag.mode, drag.days) : pending;
   const box =
      schedule && preview
         ? barGeometry(preview.start, preview.end, schedule.monthWidth)
         : { left, width };

   const begin = (mode: DragMode) => (event: PointerEvent<HTMLElement>) => {
      if (!schedule || event.button !== 0) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag({ mode, originX: event.clientX, days: 0 });
   };
   const follow = (event: PointerEvent<HTMLElement>) => {
      if (!drag || !schedule) return;
      const days = Math.round((event.clientX - drag.originX) / schedule.dayWidth);
      if (days !== drag.days) setDrag({ ...drag, days });
   };
   const finish = async () => {
      if (!drag || !schedule) return;
      setDrag(null);
      if (drag.days === 0) return;
      swallowClick.current = true;
      const next = dragSchedule(spanFor(drag.mode, schedule), drag.mode, drag.days);
      setPending(next);
      if (!(await schedule.onChange(next.start, next.end))) setPending(null);
   };

   const handle = (mode: 'start' | 'end') =>
      schedule && (
         <span
            aria-hidden="true"
            onPointerDown={begin(mode)}
            className={cn(
               'absolute inset-y-0 z-20 w-1.5 cursor-ew-resize',
               mode === 'start' ? 'left-0' : 'right-0'
            )}
         />
      );

   return (
      <div className="absolute inset-0">
         <button
            type="button"
            onClick={() => {
               if (swallowClick.current) {
                  swallowClick.current = false;
                  return;
               }
               onClick();
            }}
            onPointerDown={begin('move')}
            onPointerMove={follow}
            onPointerUp={() => void finish()}
            onPointerCancel={() => setDrag(null)}
            title={label}
            aria-label={label}
            data-testid="timeline-issue-bar"
            className={cn(
               'absolute top-1 h-6 rounded border bg-container shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
               dashed && !preview?.end && 'border-dashed',
               warning && 'outline-2 outline-offset-1 outline-amber-500',
               schedule && 'touch-none cursor-grab',
               drag && 'cursor-grabbing'
            )}
            style={{ left: box.left, width: box.width, borderColor: color }}
         >
            {handle('start')}
            <span className="relative z-10 block truncate px-2 text-xs font-medium text-foreground">
               {title}
            </span>
            {handle('end')}
         </button>
      </div>
   );
}
