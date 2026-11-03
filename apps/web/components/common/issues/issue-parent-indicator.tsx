'use client';

import { useState } from 'react';
import { HStack } from '@astryxdesign/core/Layout';
import { Icon } from '@astryxdesign/core/Icon';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { CornerDownRight } from 'lucide-react';
import { DesignSurface } from '@/components/common/design-surface';
import type { Issue } from '@/mock-data/issues';

export function IssueParentIndicator({ parent }: { parent: Issue['parent'] }) {
   const [open, setOpen] = useState(false);
   const label = parent ? `Parent: ${parent.identifier} - ${parent.title}` : '';
   return (
      <HStack width={16} className="shrink-0" justify="center">
         {parent && (
            <DesignSurface>
               <Tooltip
                  content={label}
                  placement="above"
                  delay={0}
                  hideDelay={0}
                  isOpen={open}
                  onOpenChange={setOpen}
                  focusTrigger="always"
                  touchTrigger="tap"
               >
                  <button
                     type="button"
                     aria-label={label}
                     className="size-4 text-muted-foreground"
                     onMouseEnter={() => setOpen(true)}
                     onMouseLeave={() => setOpen(false)}
                     onFocus={() => setOpen(true)}
                     onBlur={() => setOpen(false)}
                  >
                     <Icon icon={CornerDownRight} size="xsm" color="tertiary" />
                  </button>
               </Tooltip>
            </DesignSurface>
         )}
      </HStack>
   );
}
