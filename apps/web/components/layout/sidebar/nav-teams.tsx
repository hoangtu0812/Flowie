'use client';

import {
   Archive,
   Bell,
   Box,
   ChevronRight,
   CopyMinus,
   Home,
   Layers,
   Link as LinkIcon,
   MoreHorizontal,
   Settings,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuAction,
   SidebarMenuButton,
   SidebarMenuItem,
   SidebarMenuSub,
   SidebarMenuSubButton,
   SidebarMenuSubItem,
} from '@/components/ui/sidebar';
import {
   leaveWorkspaceTeam,
   loadJoinedWorkspaceTeams,
   type WorkspaceTeam,
} from '@/components/common/teams/team-types';
import { RiDonutChartFill } from '@remixicon/react';
import { toast } from 'sonner';

export function NavTeams() {
   const { orgId } = useParams<{ orgId: string }>();
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [joinedTeams, setJoinedTeams] = useState<WorkspaceTeam[]>([]);

   useEffect(() => {
      let active = true;
      const load = () => {
         void loadJoinedWorkspaceTeams()
            .then((result) => {
               if (!active) return;
               setWorkspaceId(result.workspaceId);
               setJoinedTeams(result.teams);
            })
            .catch(() => {
               if (active) {
                  setWorkspaceId(undefined);
                  setJoinedTeams([]);
               }
            });
      };
      load();
      window.addEventListener('flowie-teams-changed', load);
      return () => {
         active = false;
         window.removeEventListener('flowie-teams-changed', load);
      };
   }, [orgId]);

   const leave = async (team: WorkspaceTeam) => {
      if (!workspaceId) return;
      try {
         await leaveWorkspaceTeam(workspaceId, team.id);
         setJoinedTeams((teams) => teams.filter((item) => item.id !== team.id));
         toast.success(`Left ${team.name}.`);
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not leave team.');
      }
   };

   return (
      <SidebarGroup>
         <SidebarGroupLabel>Your teams</SidebarGroupLabel>
         <SidebarMenu>
            {joinedTeams.map((item, index) => (
               <Collapsible
                  key={item.id}
                  asChild
                  defaultOpen={index === 0}
                  className="group/collapsible"
               >
                  <SidebarMenuItem>
                     <CollapsibleTrigger asChild>
                        <SidebarMenuButton tooltip={item.name}>
                           <div className="inline-flex size-6 bg-muted/50 items-center justify-center rounded shrink-0">
                              <div className="text-sm">{item.icon}</div>
                           </div>
                           <span className="text-sm">{item.name}</span>
                           <span className="w-3 shrink-0">
                              <ChevronRight className="w-full transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                           </span>
                           <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                 <SidebarMenuAction asChild showOnHover>
                                    <div>
                                       <MoreHorizontal />
                                       <span className="sr-only">More</span>
                                    </div>
                                 </SidebarMenuAction>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                 className="w-48 rounded-lg"
                                 side="right"
                                 align="start"
                              >
                                 <DropdownMenuItem disabled>
                                    <Settings className="size-4" />
                                    <span>Team settings</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuItem
                                    onSelect={() => {
                                       void navigator.clipboard
                                          .writeText(
                                             `${window.location.origin}/${orgId}/team/${item.identifier}/overview`
                                          )
                                          .then(() => toast.success('Team link copied.'))
                                          .catch(() => toast.error('Could not copy team link.'));
                                    }}
                                 >
                                    <LinkIcon className="size-4" />
                                    <span>Copy link</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuItem disabled>
                                    <Archive className="size-4" />
                                    <span>Open archive</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuSeparator />
                                 <DropdownMenuItem disabled>
                                    <Bell className="size-4" />
                                    <span>Subscribe</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuSeparator />
                                 <DropdownMenuItem onSelect={() => void leave(item)}>
                                    <span>Leave team...</span>
                                 </DropdownMenuItem>
                              </DropdownMenuContent>
                           </DropdownMenu>
                        </SidebarMenuButton>
                     </CollapsibleTrigger>
                     <CollapsibleContent>
                        <SidebarMenuSub>
                           <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild>
                                 <Link href={`/${orgId}/team/${item.identifier}/overview`}>
                                    <Home size={14} />
                                    <span>Home</span>
                                 </Link>
                              </SidebarMenuSubButton>
                           </SidebarMenuSubItem>
                           <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild>
                                 <Link href={`/${orgId}/team/${item.identifier}/all`}>
                                    <CopyMinus size={14} />
                                    <span>Issues</span>
                                 </Link>
                              </SidebarMenuSubButton>
                           </SidebarMenuSubItem>
                           <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild>
                                 <Link href={`/${orgId}/team/${item.identifier}/cycles`}>
                                    <RiDonutChartFill size={14} />
                                    <span>Cycles</span>
                                 </Link>
                              </SidebarMenuSubButton>
                              <SidebarMenuSub className="mr-0 pr-0">
                                 <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild>
                                       <Link
                                          href={`/${orgId}/team/${item.identifier}/cycle/active`}
                                       >
                                          <span>Current</span>
                                       </Link>
                                    </SidebarMenuSubButton>
                                 </SidebarMenuSubItem>
                                 <SidebarMenuSubItem>
                                    <SidebarMenuSubButton asChild>
                                       <Link
                                          href={`/${orgId}/team/${item.identifier}/cycle/upcoming`}
                                       >
                                          <span>Upcoming</span>
                                       </Link>
                                    </SidebarMenuSubButton>
                                 </SidebarMenuSubItem>
                              </SidebarMenuSub>
                           </SidebarMenuSubItem>
                           <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild>
                                 <Link href={`/${orgId}/team/${item.identifier}/projects`}>
                                    <Box size={14} />
                                    <span>Projects</span>
                                 </Link>
                              </SidebarMenuSubButton>
                           </SidebarMenuSubItem>
                           <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild>
                                 <Link href={`/${orgId}/team/${item.identifier}/views`}>
                                    <Layers size={14} />
                                    <span>Views</span>
                                 </Link>
                              </SidebarMenuSubButton>
                           </SidebarMenuSubItem>
                        </SidebarMenuSub>
                     </CollapsibleContent>
                  </SidebarMenuItem>
               </Collapsible>
            ))}
         </SidebarMenu>
      </SidebarGroup>
   );
}
