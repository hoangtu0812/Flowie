'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { RiEditLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { useCreateIssueStore } from '@/store/create-issue-store';
export function CreateIssueTrigger() {
   const tx = useMessages(messages);

   const open = useCreateIssueStore((state) => state.openModal);
   return (
      <Button
         aria-label={tx('Create issue')}
         className="size-8 shrink-0"
         variant="secondary"
         size="icon"
         onClick={() => open()}
      >
         <RiEditLine />
      </Button>
   );
}
