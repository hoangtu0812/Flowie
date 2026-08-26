import { Loader2 } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * The wait a screen shows while its own data is in flight. A moving indicator
 * reads as "working" where a line of static text reads as "stuck".
 */
export function LoadingState({
   label = 'Loading…',
   className,
}: {
   label?: string;
   className?: string;
}) {
   return (
      <div className={cn('h-full grid place-items-center', className)}>
         <span className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {label}
         </span>
      </div>
   );
}
