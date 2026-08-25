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
import type { User } from '@/types/users';
import { CheckIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useId, useState } from 'react';
import type { ProjectListMember } from './projects';

interface LeadSelectorProps {
   lead: User;
   members: ProjectListMember[];
   onLeadChange?: (userId: string) => void | Promise<void>;
   disabled?: boolean;
}

export function LeadSelector({ lead, members, onLeadChange, disabled = false }: LeadSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string>(lead.id);

   const handleLeadChange = async (userId: string) => {
      if (!onLeadChange) return;
      try {
         await onLeadChange(userId);
         setValue(userId);
         setOpen(false);
      } catch {
         // The parent keeps the persisted value and renders the API error.
      }
   };

   return (
      <div>
         <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
               <Button
                  id={id}
                  className="flex items-center justify-center gap-1 h-7 px-2"
                  size="sm"
                  variant="ghost"
                  role="combobox"
                  aria-expanded={open}
                  disabled={disabled}
               >
                  {(() => {
                     const selectedUser =
                        members.find((user) => user.id === value) ??
                        (lead.id === value ? lead : undefined);
                     if (selectedUser) {
                        return (
                           <>
                              <Avatar className="size-5 mr-1">
                                 <AvatarImage
                                    src={selectedUser.avatarUrl ?? undefined}
                                    alt={selectedUser.name}
                                 />
                                 <AvatarFallback>{selectedUser.name.charAt(0)}</AvatarFallback>
                              </Avatar>
                              <span className="text-xs hidden md:inline">{selectedUser.name}</span>
                           </>
                        );
                     }
                     return null;
                  })()}
               </Button>
            </PopoverTrigger>
            <PopoverContent className="border-input w-48 p-0" align="start">
               <Command>
                  <CommandInput placeholder="Set lead..." />
                  <CommandList>
                     <CommandEmpty>No user found.</CommandEmpty>
                     <CommandGroup>
                        {members.map((user) => (
                           <CommandItem
                              key={user.id}
                              value={user.id}
                              onSelect={handleLeadChange}
                              className="flex items-center justify-between"
                           >
                              <div className="flex items-center gap-2">
                                 <Avatar className="size-5">
                                    <AvatarImage
                                       src={user.avatarUrl ?? undefined}
                                       alt={user.name}
                                    />
                                    <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                 </Avatar>
                                 <span className="text-xs">{user.name}</span>
                              </div>
                              {value === user.id && <CheckIcon size={14} className="ml-auto" />}
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
