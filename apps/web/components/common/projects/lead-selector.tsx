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
import type { ProjectListMember } from '@/features/projects/projects-data';
import type { User } from '@/types/users';
import { CheckIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useId, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';

interface LeadSelectorProps {
   lead: User;
   members: ProjectListMember[];
   onLeadChange?: (userId: string) => void;
}

export function LeadSelector({ lead, members, onLeadChange }: LeadSelectorProps) {
   const id = useId();
   const [open, setOpen] = useState<boolean>(false);
   const [value, setValue] = useState<string>(lead.id);

   const handleLeadChange = (userId: string) => {
      setValue(userId);
      setOpen(false);

      if (onLeadChange) {
         onLeadChange(userId);
      }
   };

   return (
      <DesignSurface>
         <VStack width="100%" className="min-w-0">
            <Popover open={open} onOpenChange={setOpen}>
               <PopoverTrigger asChild>
                  <Button
                     id={id}
                     className="w-full max-w-full min-w-0 justify-start gap-1 h-7 px-2 overflow-hidden"
                     size="sm"
                     variant="ghost"
                     role="combobox"
                     aria-expanded={open}
                     aria-label={(members.find((user) => user.id === value) ?? lead).name}
                     title={(members.find((user) => user.id === value) ?? lead).name}
                  >
                     {(() => {
                        const selectedUser = members.find((user) => user.id === value) ?? lead;
                        if (selectedUser) {
                           return (
                              <>
                                 <Avatar className="size-5 mr-1 shrink-0">
                                    <AvatarImage
                                       src={selectedUser.avatarUrl ?? undefined}
                                       alt={selectedUser.name}
                                    />
                                    <AvatarFallback>{selectedUser.name.charAt(0)}</AvatarFallback>
                                 </Avatar>
                                 <Text type="supporting" maxLines={1} className="min-w-0 truncate">
                                    {selectedUser.name}
                                 </Text>
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
                                 <HStack gap={2} className="min-w-0">
                                    <Avatar className="size-5">
                                       <AvatarImage
                                          src={user.avatarUrl ?? undefined}
                                          alt={user.name}
                                       />
                                       <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <Text type="supporting" maxLines={1}>
                                       {user.name}
                                    </Text>
                                 </HStack>
                                 {value === user.id && <CheckIcon size={14} className="ml-auto" />}
                              </CommandItem>
                           ))}
                        </CommandGroup>
                     </CommandList>
                  </Command>
               </PopoverContent>
            </Popover>
         </VStack>
      </DesignSurface>
   );
}
