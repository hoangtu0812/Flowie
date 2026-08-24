'use client';

import { Button } from '@/components/ui/button';
import {
   Command,
   CommandEmpty,
   CommandGroup,
   CommandInput,
   CommandItem,
   CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useIssuesStore } from '@/store/issues-store';
import { Status } from '@/mock-data/status';
import { CheckIcon } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { renderStatusIcon } from '@/lib/status-utils';

interface StatusSelectorProps {
   status: Status;
   issueId: string;
}

export function StatusSelector({ status, issueId }: StatusSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string>(status.id);

   const { updateIssueStatus, filterByStatus, statuses } = useIssuesStore();

   useEffect(() => {
      setValue(status.id);
   }, [status.id]);

   const handleStatusChange = async (statusId: string) => {
      const newStatus = statuses.find((status) => status.id === statusId);
      if (!newStatus) return;
      try {
         await updateIssueStatus(issueId, newStatus);
         setValue(statusId);
         setOpen(false);
      } catch {
         // The Issue store retains its server-backed value on a failed mutation.
      }
   };

   return (
      <div className="*:not-first:mt-2">
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className="size-7 flex items-center justify-center"
                  size="icon"
                  variant="ghost"
                  role="combobox"
                  aria-expanded={open}
               >
                  {renderStatusIcon(value)}
               </Button>
            </PopoverTrigger>
            <PopoverContent
               className="border-input w-full min-w-[var(--radix-popper-anchor-width)] p-0"
               align="start"
            >
               <Command>
                  <CommandInput placeholder="Set status..." />
                  <CommandList>
                     <CommandEmpty>No status found.</CommandEmpty>
                     <CommandGroup>
                        {statuses.map((item) => (
                           <CommandItem
                              key={item.id}
                              value={item.id}
                              onSelect={handleStatusChange}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2">
                                 <item.icon />
                                 {item.name}
                              </div>
                              {value === item.id && <CheckIcon size={16} className="ml-auto" />}
                              <span className="text-muted-foreground text-xs">
                                 {filterByStatus(item.id).length}
                              </span>
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  </CommandList>
               </Command>
            </PopoverContent>
         </Popover>
      </div>
   );
}
