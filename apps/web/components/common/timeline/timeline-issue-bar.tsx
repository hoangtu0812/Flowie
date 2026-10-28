'use client';

import { cn } from '@/lib/utils';

/**
 * One issue on a timeline row, shared by the Project and Initiative timelines so both draw
 * the same bar: a container-coloured fill outlined in the status colour, readable text in
 * both themes, a dashed edge when the issue has no end date, and a hover fill. `left` and
 * `width` are pixel offsets from the timeline scale; `label` is the accessible description
 * (identifier, title and date range).
 * VI: Một issue trên dòng timeline, dùng chung cho timeline Project và Initiative để hai nơi
 * VI: vẽ cùng một kiểu thanh: nền màu container, viền theo màu trạng thái, chữ đọc rõ ở cả
 * VI: hai theme, viền nét đứt khi issue chưa có ngày kết thúc, và đổi nền khi hover. `left`
 * VI: và `width` là toạ độ pixel theo thang timeline; `label` là mô tả cho trình đọc màn hình
 * VI: (mã, tiêu đề và khoảng ngày).
 */
export function TimelineIssueBar({
   left,
   width,
   color,
   dashed,
   title,
   label,
   onClick,
}: {
   left: number;
   width: number;
   color: string;
   dashed: boolean;
   title: string;
   label: string;
   onClick: () => void;
}) {
   return (
      <div className="absolute inset-0">
         <button
            type="button"
            onClick={onClick}
            title={label}
            aria-label={label}
            className={cn(
               'absolute top-1 h-6 rounded border bg-container shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
               dashed && 'border-dashed'
            )}
            style={{ left, width, borderColor: color }}
         >
            <span className="relative z-10 block truncate px-2 text-xs font-medium text-foreground">
               {title}
            </span>
         </button>
      </div>
   );
}
