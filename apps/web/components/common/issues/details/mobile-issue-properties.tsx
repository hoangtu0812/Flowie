'use client';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import type { Issue } from '@/mock-data/issues';
import type { IssueDetail } from '@/mock-data/issue-details';
import { IssuePropertiesPanel } from './issue-properties-panel';

export function MobileIssueProperties({
   issue,
   detail,
   allScreens = false,
}: {
   issue: Issue;
   detail: IssueDetail;
   allScreens?: boolean;
}) {
   const [open, setOpen] = useState(false);
   return (
      <VStack gap={3} className={allScreens ? undefined : 'lg:hidden'}>
         <Button
            label={open ? 'Hide properties' : 'Properties'}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
         />
         {open && <IssuePropertiesPanel issue={issue} detail={detail} />}
      </VStack>
   );
}
