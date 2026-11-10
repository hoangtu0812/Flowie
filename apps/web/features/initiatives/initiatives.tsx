'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingState } from '@/components/common/loading-state';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { ResourcePagination } from '@/features/shared/resource-pagination';
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
import { authenticatedFetch } from '@/lib/workspaces';
import { cn } from '@/lib/utils';
import {
   adaptInitiatives,
   countCompletedProjects,
   getInitiativeProjects,
   Initiative,
   INITIATIVE_STATUS_META,
   InitiativeStatus,
} from './initiative-ui-adapter';
import { priorities } from '@/lib/priority-presentations';
import { useInitiativesFilterStore } from '@/store/initiatives-filter-store';
import { useInitiativesDisplayStore } from '@/store/initiatives-display-store';
import { BadgeCheck, CheckIcon, PanelRight, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { InitiativeStatusIcon } from './initiative-status-icon';
import { InitiativesSidePanel } from './initiatives-side-panel';
import { InitiativesDisplayOptions, InitiativesFilter } from './initiatives-toolbar';
import { type LiveWorkspaceMember, useLiveInitiatives } from './use-live-initiatives';

const TABS = ['active', 'planned', 'all'] as const;

const TAB_ITEMS: { label: string; value: (typeof TABS)[number] }[] = [
   { label: 'Active', value: 'active' },
   { label: 'Planned', value: 'planned' },
   { label: 'All initiatives', value: 'all' },
];

/* ---------------------------------- rows ---------------------------------- */

const ACTIVE_DOT_COLORS: Record<string, string> = {
   'no-update': '#95a2b3',
   'on-track': '#4cb782',
   'at-risk': '#f2c94c',
   'off-track': '#eb5757',
};

function ActiveProjectDots({ initiative }: { initiative: Initiative }) {
   const started = getInitiativeProjects(initiative).filter(
      (project) => project.status.category === 'started'
   );
   const byHealth = new Map<string, number>();
   for (const project of started) {
      byHealth.set(project.health.id, (byHealth.get(project.health.id) ?? 0) + 1);
   }
   return (
      <span className="flex items-center gap-2">
         {[...byHealth.entries()].map(([healthId, count]) => (
            <span key={healthId} className="inline-flex items-center gap-1 text-xs">
               <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: ACTIVE_DOT_COLORS[healthId] ?? '#95a2b3' }}
               />
               {count}
            </span>
         ))}
      </span>
   );
}

async function updateInitiativeProperty(
   initiativeId: string,
   workspaceId: string | undefined,
   patch: { priority?: string; ownerId?: string | null }
) {
   if (!workspaceId) {
      throw new Error('Workspace context is not ready.');
   }
   const response = await authenticatedFetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/initiatives/${initiativeId}?workspaceId=${workspaceId}`,
      {
         method: 'PATCH',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify(patch),
      }
   );
   if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(payload?.message ?? 'Could not update initiative.');
   }
}

function InitiativePrioritySelector({
   initiative,
   workspaceId,
   onUpdated,
}: {
   initiative: Initiative;
   workspaceId?: string;
   onUpdated: () => void;
}) {
   const [open, setOpen] = useState(false);
   const [saving, setSaving] = useState(false);
   const PriorityIcon = initiative.priority.icon;

   const update = async (priority: string) => {
      if (priority === initiative.priority.id) {
         setOpen(false);
         return;
      }
      setSaving(true);
      try {
         await updateInitiativeProperty(initiative.id, workspaceId, { priority });
         setOpen(false);
         onUpdated();
         toast.success('Initiative priority updated.');
      } catch (error) {
         toast.error(
            error instanceof Error ? error.message : 'Could not update initiative priority.'
         );
      } finally {
         setSaving(false);
      }
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <button
               type="button"
               disabled={saving || !workspaceId}
               onClick={(event) => event.stopPropagation()}
               className="inline-flex size-7 items-center justify-center rounded hover:bg-accent disabled:opacity-50"
               aria-label={`Change priority for ${initiative.name}`}
            >
               <PriorityIcon className="size-4 text-muted-foreground" />
            </button>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-48 p-0">
            <Command>
               <CommandList>
                  <CommandGroup heading="Priority">
                     {priorities.map((option) => {
                        const OptionIcon = option.icon;
                        return (
                           <CommandItem key={option.id} onSelect={() => void update(option.id)}>
                              <OptionIcon className="size-4 text-muted-foreground" />
                              {option.name}
                              {option.id === initiative.priority.id && (
                                 <CheckIcon className="ml-auto size-3.5" />
                              )}
                           </CommandItem>
                        );
                     })}
                  </CommandGroup>
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}

function InitiativeOwnerSelector({
   initiative,
   members,
   workspaceId,
   onUpdated,
}: {
   initiative: Initiative;
   members: LiveWorkspaceMember[];
   workspaceId?: string;
   onUpdated: () => void;
}) {
   const [open, setOpen] = useState(false);
   const [saving, setSaving] = useState(false);

   const update = async (ownerId: string | null) => {
      if (ownerId === initiative.owner?.id) {
         setOpen(false);
         return;
      }
      setSaving(true);
      try {
         await updateInitiativeProperty(initiative.id, workspaceId, { ownerId });
         setOpen(false);
         onUpdated();
         toast.success('Initiative owner updated.');
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update initiative owner.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
            <button
               type="button"
               disabled={saving || !workspaceId}
               onClick={(event) => event.stopPropagation()}
               className="inline-flex size-7 items-center justify-center rounded hover:bg-accent disabled:opacity-50"
               aria-label={`Change owner for ${initiative.name}`}
            >
               {initiative.owner ? (
                  <Avatar className="size-5">
                     <AvatarImage
                        src={initiative.owner.avatarUrl ?? undefined}
                        alt={initiative.owner.name}
                     />
                     <AvatarFallback className="text-[9px]">
                        {initiative.owner.name[0]}
                     </AvatarFallback>
                  </Avatar>
               ) : (
                  <UserRound className="size-4 text-muted-foreground" />
               )}
            </button>
         </PopoverTrigger>
         <PopoverContent align="start" className="w-56 p-0">
            <Command>
               <CommandInput placeholder="Assign owner…" />
               <CommandList>
                  <CommandEmpty>No members found.</CommandEmpty>
                  <CommandGroup>
                     <CommandItem onSelect={() => void update(null)}>
                        <UserRound className="size-4 text-muted-foreground" />
                        No owner
                        {!initiative.owner && <CheckIcon className="ml-auto size-3.5" />}
                     </CommandItem>
                     {members.map((member) => {
                        const user = member.user;
                        return (
                           <CommandItem key={user.id} onSelect={() => void update(user.id)}>
                              <Avatar className="size-5">
                                 <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
                                 <AvatarFallback className="text-[9px]">
                                    {user.name[0]}
                                 </AvatarFallback>
                              </Avatar>
                              {user.name}
                              {initiative.owner?.id === user.id && (
                                 <CheckIcon className="ml-auto size-3.5" />
                              )}
                           </CommandItem>
                        );
                     })}
                  </CommandGroup>
               </CommandList>
            </Command>
         </PopoverContent>
      </Popover>
   );
}

function InitiativeRow({
   initiative,
   orgId,
   showStatus,
   workspaceId,
   members,
   onUpdated,
}: {
   initiative: Initiative;
   orgId: string;
   showStatus: boolean;
   workspaceId?: string;
   members: LiveWorkspaceMember[];
   onUpdated: () => void;
}) {
   const { displayProperties } = useInitiativesDisplayStore();
   const projects = getInitiativeProjects(initiative);
   const completed = countCompletedProjects(initiative);

   return (
      <div className="flex items-center gap-2 px-6 py-2 border-b border-border/50 hover:bg-sidebar/50 transition-colors text-sm">
         <span className="inline-flex size-6 items-center justify-center rounded bg-muted/50 text-sm shrink-0">
            {initiative.icon}
         </span>
         <span className="flex flex-col min-w-0 flex-1">
            <Link
               href={`/${orgId}/initiative/${initiative.id}`}
               className="font-medium truncate hover:underline underline-offset-2"
            >
               {initiative.name}
            </Link>
            {displayProperties.description && initiative.description && (
               <span className="text-xs text-muted-foreground truncate">
                  {initiative.description}
               </span>
            )}
         </span>
         {showStatus && displayProperties.status && (
            <span className="hidden md:flex items-center gap-1.5 w-28 shrink-0 text-xs">
               <InitiativeStatusIcon status={initiative.status} />
               {INITIATIVE_STATUS_META[initiative.status].label}
            </span>
         )}
         {displayProperties.priority && (
            <span className="hidden sm:flex w-16 shrink-0 items-center">
               <InitiativePrioritySelector
                  initiative={initiative}
                  workspaceId={workspaceId}
                  onUpdated={onUpdated}
               />
            </span>
         )}
         {displayProperties.owner && (
            <span className="hidden sm:flex w-14 shrink-0">
               <InitiativeOwnerSelector
                  initiative={initiative}
                  members={members}
                  workspaceId={workspaceId}
                  onUpdated={onUpdated}
               />
            </span>
         )}
         {displayProperties.target && (
            <span className="hidden md:block w-20 shrink-0 text-xs text-muted-foreground">
               {initiative.target ?? '—'}
            </span>
         )}
         {displayProperties.projects && (
            <span className="hidden md:flex items-center gap-1 w-16 shrink-0 text-xs text-muted-foreground">
               <BadgeCheck className="size-3.5 text-violet-400" />
               {completed} / {projects.length}
            </span>
         )}
         {displayProperties.health && (
            <span className="hidden xl:flex items-center gap-1.5 w-28 shrink-0 text-xs text-muted-foreground">
               <span
                  className={cn(
                     'size-3.5 rounded-full border-2 shrink-0',
                     initiative.health.id === 'no-update' && 'border-muted-foreground/40'
                  )}
                  style={
                     initiative.health.id !== 'no-update'
                        ? { borderColor: initiative.health.color }
                        : undefined
                  }
               />
               {initiative.health.id === 'no-update' ? 'No updates' : initiative.health.name}
            </span>
         )}
         {displayProperties.activeProjects && (
            <span className="hidden xl:block w-24 shrink-0">
               <ActiveProjectDots initiative={initiative} />
            </span>
         )}
      </div>
   );
}

/* ---------------------------------- page ---------------------------------- */

export default function Initiatives() {
   const { orgId } = useParams<{ orgId: string }>();
   const [tab, setTab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('active'));
   const { filters } = useInitiativesFilterStore();
   const { grouping, ordering, displayProperties } = useInitiativesDisplayStore();
   const [showPanel, setShowPanel] = useState(true);
   const {
      workspaceId,
      initiatives: liveInitiatives,
      members,
      loading,
      error,
      reload,
      page,
      loadingMore,
      pageError,
      loadMore,
   } = useLiveInitiatives();
   const allInitiatives = useMemo(() => adaptInitiatives(liveInitiatives), [liveInitiatives]);

   const displayed = useMemo(() => {
      let list = allInitiatives.slice();
      if (tab !== 'all') list = list.filter((initiative) => initiative.status === tab);
      if (filters.status.length > 0) {
         list = list.filter((initiative) => filters.status.includes(initiative.status));
      }
      if (filters.priority.length > 0) {
         list = list.filter((initiative) => filters.priority.includes(initiative.priority.id));
      }
      if (filters.owner.length > 0) {
         list = list.filter(
            (initiative) => initiative.owner && filters.owner.includes(initiative.owner.id)
         );
      }
      if (filters.health.length > 0) {
         list = list.filter((initiative) => filters.health.includes(initiative.health.id));
      }
      if (ordering === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
      else if (ordering === 'target')
         list.sort((a, b) => (a.target ?? '').localeCompare(b.target ?? ''));
      return list;
   }, [allInitiatives, tab, filters, ordering]);

   const groups = useMemo(() => {
      if (grouping !== 'status') return null;
      return (Object.keys(INITIATIVE_STATUS_META) as InitiativeStatus[])
         .map((statusId) => ({
            statusId,
            items: displayed.filter((initiative) => initiative.status === statusId),
         }))
         .filter((group) => group.items.length > 0);
   }, [grouping, displayed]);

   const showStatus = tab === 'all';

   return (
      <div className="w-full h-full flex overflow-hidden">
         <div className="flex-1 min-w-0 h-full overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-3 pb-2 sticky top-0 bg-background z-10">
               <div className="flex items-center gap-1.5">
                  {TAB_ITEMS.map((item) => (
                     <button
                        key={item.value}
                        onClick={() => setTab(item.value)}
                        className={cn(
                           'px-2.5 py-1 rounded-md border text-xs font-medium transition-colors',
                           tab === item.value
                              ? 'bg-accent border-transparent'
                              : 'text-muted-foreground hover:bg-accent/50'
                        )}
                     >
                        {item.label}
                     </button>
                  ))}
               </div>
               <div className="flex items-center gap-1">
                  <InitiativesFilter members={members} />
                  <InitiativesDisplayOptions />
                  <Button
                     size="xs"
                     variant={showPanel ? 'secondary' : 'ghost'}
                     onClick={() => setShowPanel((value) => !value)}
                  >
                     <PanelRight className="size-4" />
                  </Button>
               </div>
            </div>

            <div className="flex items-center gap-2 px-6 py-1.5 text-xs text-muted-foreground border-b">
               <span className="flex-1">Name</span>
               {showStatus && displayProperties.status && (
                  <span className="hidden md:block w-28 shrink-0">Status</span>
               )}
               {displayProperties.priority && (
                  <span className="hidden sm:block w-16 shrink-0">Priority</span>
               )}
               {displayProperties.owner && (
                  <span className="hidden sm:block w-14 shrink-0">Owner</span>
               )}
               {displayProperties.target && (
                  <span className="hidden md:block w-20 shrink-0">Target</span>
               )}
               {displayProperties.projects && (
                  <span className="hidden md:block w-16 shrink-0">Projects</span>
               )}
               {displayProperties.health && (
                  <span className="hidden xl:block w-28 shrink-0">Health</span>
               )}
               {displayProperties.activeProjects && (
                  <span className="hidden xl:block w-24 shrink-0">Active Projects</span>
               )}
            </div>

            <ResourcePagination
               count={liveInitiatives.length}
               page={page}
               loading={loadingMore}
               error={pageError}
               loadMore={loadMore}
               reload={reload}
               label="initiatives (filters apply to loaded rows)"
            />
            {loading && <LoadingState label="Loading initiatives…" className="min-h-48" />}
            {error && (
               <RecoveryScreen title="Could not load initiatives" message={error} retry={reload} />
            )}
            {!loading && !error && groups
               ? groups.map((group) => (
                    <div key={group.statusId}>
                       <div className="flex items-center gap-2 px-6 h-9 text-sm font-medium bg-[color-mix(in_oklab,var(--accent)_30%,var(--container))] border-b border-border/40">
                          <InitiativeStatusIcon status={group.statusId} />
                          {INITIATIVE_STATUS_META[group.statusId].label}
                          <span className="text-xs text-muted-foreground">
                             {group.items.length}
                          </span>
                       </div>
                       {group.items.map((initiative) => (
                          <InitiativeRow
                             key={initiative.id}
                             initiative={initiative}
                             orgId={orgId}
                             showStatus={showStatus}
                             workspaceId={workspaceId}
                             members={members}
                             onUpdated={reload}
                          />
                       ))}
                    </div>
                 ))
               : !loading &&
                 !error &&
                 displayed.map((initiative) => (
                    <InitiativeRow
                       key={initiative.id}
                       initiative={initiative}
                       orgId={orgId}
                       showStatus={showStatus}
                       workspaceId={workspaceId}
                       members={members}
                       onUpdated={reload}
                    />
                 ))}
         </div>
         {showPanel && <InitiativesSidePanel initiatives={displayed} />}
      </div>
   );
}
