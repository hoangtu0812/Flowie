'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { priorities } from '@/lib/priority-presentations';
import { InitiativesFilterType, useInitiativesFilterStore } from '@/store/initiatives-filter-store';
import {
   InitiativesDisplayProperties,
   useInitiativesDisplayStore,
} from '@/store/initiatives-display-store';
import {
   BadgeCheck,
   CheckIcon,
   ChevronRight,
   HeartPulse,
   ListFilter,
   SlidersHorizontal,
   UserRound,
} from 'lucide-react';
import { useState } from 'react';
import {
   initiativeHealth,
   INITIATIVE_STATUS_META,
   InitiativeStatus,
} from './initiative-ui-adapter';
import { InitiativeStatusIcon } from './initiative-status-icon';
import type { LiveWorkspaceMember } from './use-live-initiatives';

/* --------------------------------- filter --------------------------------- */

export function InitiativesFilter({ members }: { members: LiveWorkspaceMember[] }) {
   const [open, setOpen] = useState(false);
   const [active, setActive] = useState<InitiativesFilterType | null>(null);
   const { filters, toggleFilter, clearFilters, getActiveFiltersCount } =
      useInitiativesFilterStore();

   const count = getActiveFiltersCount();

   return (
      <Popover
         open={open}
         onOpenChange={(next) => {
            setOpen(next);
            if (!next) setActive(null);
         }}
      >
         <PopoverTrigger asChild>
            <Button size="xs" variant="ghost" className="relative">
               <ListFilter className="size-4" />
               {count > 0 && (
                  <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground text-[9px] inline-flex items-center justify-center">
                     {count}
                  </span>
               )}
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-60 p-0">
            <Command>
               <CommandInput placeholder={active ? 'Filter...' : 'Add filter...'} />
               <CommandList>
                  <CommandEmpty>No results.</CommandEmpty>
                  {!active && (
                     <CommandGroup>
                        <CommandItem onSelect={() => setActive('status')}>
                           <BadgeCheck className="size-4 text-muted-foreground" />
                           Status
                           <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                        </CommandItem>
                        <CommandItem onSelect={() => setActive('priority')}>
                           <SlidersHorizontal className="size-4 text-muted-foreground" />
                           Priority
                           <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                        </CommandItem>
                        <CommandItem onSelect={() => setActive('owner')}>
                           <UserRound className="size-4 text-muted-foreground" />
                           Owner
                           <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                        </CommandItem>
                        <CommandItem onSelect={() => setActive('health')}>
                           <HeartPulse className="size-4 text-muted-foreground" />
                           Health
                           <ChevronRight className="ml-auto size-3.5 text-muted-foreground" />
                        </CommandItem>
                        {count > 0 && (
                           <CommandItem onSelect={() => clearFilters()}>Clear filters</CommandItem>
                        )}
                     </CommandGroup>
                  )}
                  {active === 'status' && (
                     <CommandGroup>
                        {(Object.keys(INITIATIVE_STATUS_META) as InitiativeStatus[]).map(
                           (statusId) => (
                              <CommandItem
                                 key={statusId}
                                 onSelect={() => toggleFilter('status', statusId)}
                              >
                                 <InitiativeStatusIcon status={statusId} />
                                 {INITIATIVE_STATUS_META[statusId].label}
                                 {filters.status.includes(statusId) && (
                                    <CheckIcon className="ml-auto size-3.5" />
                                 )}
                              </CommandItem>
                           )
                        )}
                     </CommandGroup>
                  )}
                  {active === 'priority' && (
                     <CommandGroup>
                        {priorities.map((priority) => (
                           <CommandItem
                              key={priority.id}
                              onSelect={() => toggleFilter('priority', priority.id)}
                           >
                              <priority.icon className="size-4 text-muted-foreground" />
                              {priority.name}
                              {filters.priority.includes(priority.id) && (
                                 <CheckIcon className="ml-auto size-3.5" />
                              )}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  )}
                  {active === 'owner' && (
                     <CommandGroup>
                        {members.slice(0, 10).map((member) => {
                           const user = member.user;
                           return (
                              <CommandItem
                                 key={user.id}
                                 onSelect={() => toggleFilter('owner', user.id)}
                              >
                                 <Avatar className="size-4">
                                    <AvatarImage
                                       src={user.avatarUrl ?? undefined}
                                       alt={user.name}
                                    />
                                    <AvatarFallback className="text-[8px]">
                                       {user.name[0]}
                                    </AvatarFallback>
                                 </Avatar>
                                 {user.name}
                                 {filters.owner.includes(user.id) && (
                                    <CheckIcon className="ml-auto size-3.5" />
                                 )}
                              </CommandItem>
                           );
                        })}
                     </CommandGroup>
                  )}
                  {active === 'health' && (
                     <CommandGroup>
                        {initiativeHealth.map((entry) => (
                           <CommandItem
                              key={entry.id}
                              onSelect={() => toggleFilter('health', entry.id)}
                           >
                              <span
                                 className="size-2.5 rounded-full"
                                 style={{ backgroundColor: entry.color }}
                              />
                              {entry.name}
                              {filters.health.includes(entry.id) && (
                                 <CheckIcon className="ml-auto size-3.5" />
                              )}
                           </CommandItem>
                        ))}
                     </CommandGroup>
                  )}
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}

/* ----------------------------- display options ---------------------------- */

const PROPERTY_CHIPS: { key: keyof InitiativesDisplayProperties; label: string }[] = [
   { key: 'description', label: 'Description' },
   { key: 'status', label: 'Status' },
   { key: 'priority', label: 'Priority' },
   { key: 'owner', label: 'Owner' },
   { key: 'target', label: 'Target date' },
   { key: 'projects', label: 'Projects' },
   { key: 'health', label: 'Health' },
   { key: 'activeProjects', label: 'Active projects' },
];

export function InitiativesDisplayOptions() {
   const { grouping, ordering, displayProperties, setGrouping, setOrdering, toggleProperty } =
      useInitiativesDisplayStore();

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button size="xs" variant="ghost">
               <SlidersHorizontal className="size-4" />
            </Button>
         </PopoverTrigger>
         <PopoverContent align="end" className="w-80 p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
               <span className="text-xs text-muted-foreground">Grouping</span>
               <Select
                  value={grouping}
                  onValueChange={(value) => setGrouping(value as typeof grouping)}
               >
                  <SelectTrigger className="w-36 h-7 text-xs">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="none">No grouping</SelectItem>
                     <SelectItem value="status">Status</SelectItem>
                  </SelectContent>
               </Select>
            </div>
            <div className="flex items-center justify-between">
               <span className="text-xs text-muted-foreground">Ordering</span>
               <Select
                  value={ordering}
                  onValueChange={(value) => setOrdering(value as typeof ordering)}
               >
                  <SelectTrigger className="w-36 h-7 text-xs">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="manual">Manual</SelectItem>
                     <SelectItem value="name">Name</SelectItem>
                     <SelectItem value="target">Target date</SelectItem>
                  </SelectContent>
               </Select>
            </div>
            <div className="flex flex-col gap-2">
               <span className="text-xs text-muted-foreground">Display properties</span>
               <div className="flex flex-wrap gap-1.5">
                  {PROPERTY_CHIPS.map(({ key, label }) => (
                     <button
                        key={key}
                        onClick={() => toggleProperty(key)}
                        className={cn(
                           'px-2 py-0.5 rounded-md border text-xs transition-colors',
                           displayProperties[key]
                              ? 'bg-accent border-transparent'
                              : 'text-muted-foreground hover:bg-accent/50'
                        )}
                     >
                        {label}
                     </button>
                  ))}
               </div>
            </div>
         </PopoverContent>
      </Popover>
   );
}
