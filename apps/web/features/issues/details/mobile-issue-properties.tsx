'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import type { Issue } from '@/types/issues';
import type { CodeReview } from '@/lib/scm';
import { IssuePropertiesPanel } from './issue-properties-panel';

export function MobileIssueProperties({
   issue,
   reviews,
   allScreens = false,
}: {
   issue: Issue;
   reviews?: CodeReview[];
   allScreens?: boolean;
}) {
   const tx = useMessages(messages);

   const [open, setOpen] = useState(false);
   return (
      <VStack gap={3} className={allScreens ? undefined : 'lg:hidden'}>
         <Button
            label={open ? tx('Hide properties') : tx('Properties')}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
         />
         {open && <IssuePropertiesPanel issue={issue} reviews={reviews} />}
      </VStack>
   );
}
