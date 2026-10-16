'use client';

import { HStack } from '@astryxdesign/core/Layout';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { DesignSurface } from '@/components/common/design-surface';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';

export const healthOptions = [
   { value: 'on-track', label: 'On track', variant: 'success' },
   { value: 'at-risk', label: 'At risk', variant: 'warning' },
   { value: 'off-track', label: 'Off track', variant: 'error' },
   { value: 'no-update', label: 'No update', variant: 'neutral' },
] as const;

export function HealthBadge({ health }: { health: string }) {
   const tx = useMessages(messages);
   const option = healthOptions.find(
      (item) => item.value === health.toLowerCase().replaceAll('_', '-')
   );
   const label = option ? tx(option.label) : health;
   return (
      <HStack
         gap={1.5}
         align="center"
         className="w-fit rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap"
      >
         <DesignSurface>
            <StatusDot variant={option?.variant ?? 'neutral'} label={label} />
         </DesignSurface>
         {label}
      </HStack>
   );
}
