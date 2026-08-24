'use client';

import {
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
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RiDonutChartFill } from '@remixicon/react';
import {
   leaveWorkspaceTeam,
   loadJoinedWorkspaceTeams,
   WorkspaceTeam,
} from '@/components/common/teams/team-types';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export function NavTeams() {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const [joinedTeams, setJoinedTeams] = useState<WorkspaceTeam[]>([]);
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [leaveTarget, setLeaveTarget] = useState<WorkspaceTeam>();
   const [leaving, setLeaving] = useState(false);
   const [leaveError, setLeaveError] = useState<string>();

   useEffect(() => {
      void loadJoinedWorkspaceTeams()
         .then(({ workspaceId, teams }) => {
            setWorkspaceId(workspaceId);
            setJoinedTeams(teams);
         })
         .catch(() => setJoinedTeams([]));
   }, []);

   const organization = orgId;
   const copyTeamLink = async (team: WorkspaceTeam) => {
      await navigator.clipboard.writeText(
         `${window.location.origin}/${organization}/team/${team.identifier}/overview`
      );
   };
   const leaveTeam = async () => {
      if (!workspaceId || !leaveTarget || leaving) return;
      setLeaving(true);
      setLeaveError(undefined);
      try {
         await leaveWorkspaceTeam(workspaceId, leaveTarget.id);
         setJoinedTeams((teams) => teams.filter((team) => team.id !== leaveTarget.id));
         setLeaveTarget(undefined);
         router.push(`/${organization}/teams`);
         router.refresh();
      } catch (error) {
         setLeaveError(error instanceof Error ? error.message : 'Could not leave this team.');
      } finally {
         setLeaving(false);
      }
   };
   return (
      <>
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
                                 <div className="text-sm">{item.icon ?? '👥'}</div>
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
                                    <DropdownMenuItem asChild>
                                       <Link href={`/${organization}/settings/teams/${item.id}`}>
                                          <Settings className="size-4" />
                                          <span>Team settings</span>
                                       </Link>
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onSelect={() => void copyTeamLink(item)}>
                                       <LinkIcon className="size-4" />
                                       <span>Copy link</span>
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem onSelect={() => setLeaveTarget(item)}>
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
                                    <Link
                                       href={`/${organization}/team/${item.identifier}/overview`}
                                    >
                                       <Home size={14} />
                                       <span>Home</span>
                                    </Link>
                                 </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                 <SidebarMenuSubButton asChild>
                                    <Link href={`/${organization}/team/${item.identifier}/all`}>
                                       <CopyMinus size={14} />
                                       <span>Issues</span>
                                    </Link>
                                 </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                 <SidebarMenuSubButton asChild>
                                    <Link href={`/${organization}/team/${item.identifier}/cycles`}>
                                       <RiDonutChartFill size={14} />
                                       <span>Cycles</span>
                                    </Link>
                                 </SidebarMenuSubButton>
                                 <SidebarMenuSub className="mr-0 pr-0">
                                    <SidebarMenuSubItem>
                                       <SidebarMenuSubButton asChild>
                                          <Link
                                             href={`/${organization}/team/${item.identifier}/cycle/active`}
                                          >
                                             <span>Current</span>
                                          </Link>
                                       </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                    <SidebarMenuSubItem>
                                       <SidebarMenuSubButton asChild>
                                          <Link
                                             href={`/${organization}/team/${item.identifier}/cycle/upcoming`}
                                          >
                                             <span>Upcoming</span>
                                          </Link>
                                       </SidebarMenuSubButton>
                                    </SidebarMenuSubItem>
                                 </SidebarMenuSub>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                 <SidebarMenuSubButton asChild>
                                    <Link
                                       href={`/${organization}/team/${item.identifier}/projects`}
                                    >
                                       <Box size={14} />
                                       <span>Projects</span>
                                    </Link>
                                 </SidebarMenuSubButton>
                              </SidebarMenuSubItem>
                              <SidebarMenuSubItem>
                                 <SidebarMenuSubButton asChild>
                                    <Link href={`/${organization}/team/${item.identifier}/views`}>
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
         <AlertDialog
            open={Boolean(leaveTarget)}
            onOpenChange={(open) => {
               if (!open && !leaving) {
                  setLeaveTarget(undefined);
                  setLeaveError(undefined);
               }
            }}
         >
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>Leave {leaveTarget?.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                     You will lose access to this team&apos;s private workspace until you join
                     again.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               {leaveError && <p className="text-sm text-destructive">{leaveError}</p>}
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={leaving}>Cancel</AlertDialogCancel>
                  <AlertDialogAction disabled={leaving} onClick={() => void leaveTeam()}>
                     {leaving ? 'Leaving…' : 'Leave team'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </>
   );
}
