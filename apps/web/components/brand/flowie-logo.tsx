import { cn } from '@/lib/utils';

export function FlowieLogo({
   className,
   loading = false,
   label = false,
}: {
   className?: string;
   loading?: boolean;
   label?: boolean;
}) {
   return (
      <span className={cn('inline-flex items-center gap-2.5', className)}>
         <svg
            aria-label="Flowie"
            className={cn('flowie-logo size-8 shrink-0', loading && 'flowie-logo-loading')}
            fill="none"
            role="img"
            viewBox="0 0 40 40"
         >
            <rect fill="currentColor" height="40" rx="11" width="40" />
            <path d="M10 13.5h20L20 29.5 10 13.5Z" fill="white" opacity=".97" />
            <path d="M10 13.5h10L15 22 10 13.5Z" fill="white" opacity=".52" />
            <path d="M20 13.5h10L25 22l-5-8.5Z" fill="white" opacity=".76" />
         </svg>
         {label && <span className="text-lg font-semibold tracking-[-0.04em]">Flowie</span>}
      </span>
   );
}
