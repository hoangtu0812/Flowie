'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { fittingChipCount } from './chip-fit';

// Matches the `gap-1` between chips. VI: Khớp với `gap-1` giữa các chip.
const CHIP_GAP = 4;

/**
 * Row of chips sized to its cell: every chip and a sample "+N" are rendered once in an invisible
 * layer to read their natural widths, a ResizeObserver on the row recomputes how many fit when the
 * column is resized, and the rest collapse into "+N" whose hover title lists their names.
 * VI: Hàng chip theo độ rộng ô: mọi chip và một "+N" mẫu được vẽ một lần trong lớp ẩn để đọc độ
 * VI: rộng tự nhiên, ResizeObserver trên hàng tính lại số chip vừa khi cột đổi độ rộng, phần còn
 * VI: lại gộp vào "+N" có tiêu đề hover liệt kê tên của chúng.
 */
export function FittedChips<T extends { id: string; name: string }>({
   items,
   render,
}: {
   items: T[];
   render: (items: T[]) => ReactNode;
}) {
   const rowRef = useRef<HTMLDivElement>(null);
   const measureRef = useRef<HTMLDivElement>(null);
   const [count, setCount] = useState(1);

   useLayoutEffect(() => {
      const row = rowRef.current;
      const measure = measureRef.current;
      if (!row || !measure) return;
      const fit = () => {
         const widths = Array.from(
            measure.children,
            (child) => child.getBoundingClientRect().width
         );
         const overflowWidth = widths.pop() ?? 0;
         setCount(fittingChipCount(widths, overflowWidth, row.clientWidth, CHIP_GAP));
      };
      fit();
      const observer = new ResizeObserver(fit);
      observer.observe(row);
      return () => observer.disconnect();
   }, [items]);

   const hidden = items.slice(count);
   return (
      <div ref={rowRef} className="relative flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
         <div
            ref={measureRef}
            aria-hidden
            className="pointer-events-none invisible absolute left-0 top-0 flex w-max gap-1"
         >
            {items.map((item) => (
               <span key={item.id} className="flex">
                  {render([item])}
               </span>
            ))}
            <span className="text-xs">+{items.length}</span>
         </div>
         {render(items.slice(0, count))}
         {hidden.length > 0 && (
            <span
               className="text-xs text-muted-foreground shrink-0"
               title={hidden.map((item) => item.name).join(', ')}
            >
               +{hidden.length}
            </span>
         )}
      </div>
   );
}
