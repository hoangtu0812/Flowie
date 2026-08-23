'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PlaceholderConfig } from './placeholder-sections';

/** Hand-drawn-style dashed smiley used by the empty states. */
export function DashedSmiley() {
   return (
      <svg
         width="130"
         height="78"
         viewBox="0 0 130 78"
         fill="none"
         className="text-foreground/70"
         aria-hidden
      >
         <ellipse
            cx="65"
            cy="39"
            rx="60"
            ry="32"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="7 6"
            strokeLinecap="round"
         />
         <path
            d="M48 28c2 4 3 6 2 9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
         />
         <path
            d="M78 26c2 4 3 6 2 9"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
         />
         <path
            d="M44 47c8 7 28 8 40-2"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="5 5"
         />
      </svg>
   );
}

/**
 * Generic settings page used by configuration sections that do not have a
 * persistence service yet. The original layout remains visible, but no
 * filter or mutation can be mistaken for a successful saved setting.
 */
export default function SettingsPlaceholder({ config }: { config: PlaceholderConfig }) {
   return (
      <div className="w-full overflow-y-auto h-full">
         <div className="max-w-4xl mx-auto px-6 py-10">
            <h1 className="text-2xl font-medium">{config.title}</h1>
            {config.description && (
               <p className="text-sm text-muted-foreground mt-1">{config.description}</p>
            )}

            <div className="flex items-center justify-between gap-3 mt-6">
               <Input placeholder="Filtering is not available yet" className="w-72 h-8" disabled />
               {config.actionLabel && (
                  <Button
                     size="xs"
                     disabled
                     title={`${config.title} settings are not available yet`}
                  >
                     {config.actionLabel}
                  </Button>
               )}
            </div>

            <div className="flex flex-col items-center justify-center gap-5 py-32">
               <DashedSmiley />
               <p className="text-sm text-muted-foreground">{config.emptyLabel}</p>
               <p className="text-xs text-muted-foreground text-center max-w-sm">
                  Configuration for this feature is not available yet.
               </p>
            </div>
         </div>
      </div>
   );
}
