'use client';
import { RiEditLine } from '@remixicon/react';
import { Button } from '@/components/ui/button';
import { useCreateIssueStore } from '@/store/create-issue-store';
export function CreateIssueTrigger() {
   const open = useCreateIssueStore((state) => state.openModal);
   return (
      <Button
         aria-label="Create issue"
         className="size-8 shrink-0"
         variant="secondary"
         size="icon"
         onClick={() => open()}
      >
         <RiEditLine />
      </Button>
   );
}
