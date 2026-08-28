import { FlowieLogo } from '@/components/brand/flowie-logo';
import { cn } from '@/lib/utils';

/**
 * Shared, non-blocking screen loader. The bar is intentionally indeterminate:
 * request duration is unknown, so a fake percentage would misrepresent progress.
 */
export function LoadingState({
   label = 'Loading…',
   className,
}: {
   label?: string;
   className?: string;
}) {
   return (
      <div className={cn('h-full min-h-32 grid place-items-center', className)} role="status">
         <div className="flex w-36 flex-col items-center gap-3">
            <div className="relative grid size-11 place-items-center rounded-xl bg-muted/70 shadow-sm">
               <FlowieLogo loading className="[&>svg]:size-8" />
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
               <span className="flowie-loading-progress block h-full w-[38%] rounded-full bg-gradient-to-r from-orange-400 via-orange-500 to-amber-300" />
            </div>
            <span className="sr-only">{label}</span>
         </div>
      </div>
   );
}
