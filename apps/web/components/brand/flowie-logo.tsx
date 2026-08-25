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
            aria-label={loading ? 'Flowie đang tải' : 'Flowie'}
            className={cn('flowie-logo size-8 shrink-0', loading && 'flowie-logo-loading')}
            fill="none"
            role="img"
            viewBox="0 0 72 72"
         >
            <rect height="72" rx="16" width="72" fill="#09090b" />
            <path d="M15 15h26L32 28H23L15 15Z" fill="#ff761a" />
            <path d="M41 15h24L46 43 33 28 41 15Z" fill="#ff963f" />
            <path d="m23 28 10 15-10 16H15l8-31Z" fill="#f75b0b" />
            <path d="m33 43h13l13 16H23l10-16Z" fill="#ffd49f" />
            <path d="M46 43 65 15v31L59 59 46 43Z" fill="#c94206" />
            {loading && (
               <circle
                  cx="36"
                  cy="36"
                  fill="none"
                  r="31"
                  stroke="#ffffff"
                  strokeDasharray="28 168"
                  strokeLinecap="round"
                  strokeWidth="2"
               >
                  <animateTransform
                     attributeName="transform"
                     dur="900ms"
                     from="0 36 36"
                     repeatCount="indefinite"
                     to="360 36 36"
                     type="rotate"
                  />
               </circle>
            )}
         </svg>
         {label && <span className="text-lg font-semibold tracking-[-0.04em]">Flowie</span>}
      </span>
   );
}
