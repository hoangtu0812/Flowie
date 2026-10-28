'use client';

import * as React from 'react';
import * as ScrollAreaPrimitive from '@radix-ui/react-scroll-area';

import { cn } from '@/lib/utils';

/**
 * Scroll container with an overlay scrollbar that appears on hover or while scrolling,
 * so it never takes layout width. The viewport keeps native wheel, keyboard and touch
 * scrolling. The thumb uses the shared --scrollbar-thumb tokens from globals.css.
 * VI: Khối cuộn có thanh cuộn nổi, chỉ hiện khi hover hoặc đang cuộn nên không chiếm
 * VI: chiều rộng layout. Viewport giữ cơ chế cuộn gốc bằng chuột, bàn phím, cảm ứng. Thumb
 * VI: dùng token --scrollbar-thumb chung trong globals.css.
 */
function ScrollArea({
   className,
   children,
   ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root>) {
   return (
      <ScrollAreaPrimitive.Root
         data-slot="scroll-area"
         className={cn('relative', className)}
         {...props}
      >
         <ScrollAreaPrimitive.Viewport
            data-slot="scroll-area-viewport"
            className="size-full rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
         >
            {children}
         </ScrollAreaPrimitive.Viewport>
         <ScrollBar />
         <ScrollAreaPrimitive.Corner />
      </ScrollAreaPrimitive.Root>
   );
}

function ScrollBar({
   className,
   orientation = 'vertical',
   ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
   return (
      <ScrollAreaPrimitive.ScrollAreaScrollbar
         data-slot="scroll-area-scrollbar"
         orientation={orientation}
         className={cn(
            'flex touch-none p-px select-none',
            orientation === 'vertical' && 'h-full w-2',
            orientation === 'horizontal' && 'h-2 flex-col',
            className
         )}
         {...props}
      >
         <ScrollAreaPrimitive.ScrollAreaThumb
            data-slot="scroll-area-thumb"
            className="relative flex-1 rounded-full bg-(--scrollbar-thumb) transition-colors hover:bg-(--scrollbar-thumb-hover)"
         />
      </ScrollAreaPrimitive.ScrollAreaScrollbar>
   );
}

export { ScrollArea, ScrollBar };
