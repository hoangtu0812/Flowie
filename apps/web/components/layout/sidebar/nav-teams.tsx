'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/navigation/messages.vi';

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
   Users,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
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
} from '@/features/teams/team-types';
import { RiDonutChartFill } from '@remixicon/react';
import { toast } from 'sonner';
import { withBasePath } from '@/lib/base-path';
import { useSidebarSection } from '@/store/sidebar-collapse-store';
import { isProjectPage, NavProjectList, useSidebarProjects } from './nav-project-list';

export function NavTeams() {
   const tx = useMessages(messages);

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
         <SidebarGroupLabel>{tx('Your teams')}</SidebarGroupLabel>
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
                                       <span className="sr-only">{tx('More')}</span>
                                    </div>
                                 </SidebarMenuAction>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                 className="w-48 rounded-lg"
                                 side="right"
                                 align="start"
                              >
                                 <DropdownMenuItem asChild>
                                    <Link href={`/${orgId}/settings/teams/${item.id}`}>
                                       <Settings className="size-4" />
                                       <span>{tx('Team settings')}</span>
                                    </Link>
                                 </DropdownMenuItem>
                                 <DropdownMenuItem
                                    onSelect={() => {
                                       void navigator.clipboard
                                          .writeText(
                                             `${window.location.origin}${withBasePath(`/${orgId}/team/${item.identifier}/overview`)}`
                                          )
                                          .then(() => toast.success(tx('Team link copied.')))
                                          .catch(() =>
                                             toast.error(tx('Could not copy team link.'))
                                          );
                                    }}
                                 >
                                    <LinkIcon className="size-4" />
                                    <span>{tx('Copy link')}</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuItem disabled>
                                    <Archive className="size-4" />
                                    <span>{tx('Open archive')}</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuSeparator />
                                 <DropdownMenuItem disabled>
                                    <Bell className="size-4" />
                                    <span>{tx('Subscribe')}</span>
                                 </DropdownMenuItem>
                                 <DropdownMenuSeparator />
                                 <DropdownMenuItem onSelect={() => void leave(item)}>
                                    <span>{tx('Leave team...')}</span>
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
                                    <span>{tx('Home')}</span>
                                 </Link>
                              </SidebarMenuSubButton>
                           </SidebarMenuSubItem>
                           <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild>
                                 <Link href={`/${orgId}/team/${item.identifier}/all`}>
                                    <CopyMinus size={14} />
                                    <span>{tx('Issues')}</span>
                                 </Link>
                              </SidebarMenuSubButton>
                           </SidebarMenuSubItem>
                           <TeamCycles orgId={orgId} team={item} />
                           <TeamProjects orgId={orgId} team={item} />
                           <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild>
                                 <Link href={`/${orgId}/team/${item.identifier}/views`}>
                                    <Layers size={14} />
                                    <span>{tx('Views')}</span>
                                 </Link>
                              </SidebarMenuSubButton>
                           </SidebarMenuSubItem>
                           <SidebarMenuSubItem>
                              <SidebarMenuSubButton asChild>
                                 <Link href={`/${orgId}/team/${item.identifier}/members`}>
                                    <Users size={14} />
                                    <span>{tx('Members')}</span>
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

/**
 * Toggle for a collapsible team entry: a chevron next to the entry's link, so clicking the text
 * still navigates and only the chevron collapses or expands.
 * VI: Nút thu gọn của một mục team: chevron cạnh link của mục, nên bấm chữ vẫn điều hướng và chỉ
 * VI: bấm chevron mới thu gọn hoặc mở rộng.
 */
function SectionToggle({ label }: { label: string }) {
   return (
      <CollapsibleTrigger asChild>
         <SidebarMenuAction aria-label={label} className="top-1 data-[state=open]:rotate-90">
            <ChevronRight />
         </SidebarMenuAction>
      </CollapsibleTrigger>
   );
}

/**
 * The team's Cycles entry with Current and Upcoming underneath, collapsible per team; a cycle page
 * of this team opens it.
 * VI: Mục Cycles của team với Current và Upcoming bên dưới, thu gọn riêng theo team; trang cycle
 * VI: của team này sẽ mở nó.
 */
function TeamCycles({ orgId, team }: { orgId: string; team: WorkspaceTeam }) {
   const tx = useMessages(messages);
   const base = `/${orgId}/team/${team.identifier}`;
   const [open, setOpen] = useSidebarSection(
      `team:${team.id}:cycles`,
      usePathname().startsWith(`${base}/cycle/`)
   );
   return (
      <Collapsible open={open} onOpenChange={setOpen} asChild>
         <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild>
               <Link href={`${base}/cycles`}>
                  <RiDonutChartFill size={14} />
                  <span>{tx('Cycles')}</span>
               </Link>
            </SidebarMenuSubButton>
            <SectionToggle label={tx('Toggle Cycles')} />
            <CollapsibleContent>
               <SidebarMenuSub className="mr-0 pr-0">
                  <SidebarMenuSubItem>
                     <SidebarMenuSubButton asChild>
                        <Link href={`${base}/cycle/active`}>
                           <span>{tx('Current')}</span>
                        </Link>
                     </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                     <SidebarMenuSubButton asChild>
                        <Link href={`${base}/cycle/upcoming`}>
                           <span>{tx('Upcoming')}</span>
                        </Link>
                     </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
               </SidebarMenuSub>
            </CollapsibleContent>
         </SidebarMenuSubItem>
      </Collapsible>
   );
}

/**
 * The team's Projects entry with the team's current projects underneath, collapsible per team; a
 * page of one of those projects opens it.
 * VI: Mục Projects của team với các dự án hiện tại của team bên dưới, thu gọn riêng theo team;
 * VI: trang của một trong các dự án đó sẽ mở nó.
 */
function TeamProjects({ orgId, team }: { orgId: string; team: WorkspaceTeam }) {
   const tx = useMessages(messages);
   const projects = useSidebarProjects(team.id);
   const href = `/${orgId}/team/${team.identifier}/projects`;
   const [open, setOpen] = useSidebarSection(
      `team:${team.id}:projects`,
      isProjectPage(usePathname(), orgId, projects)
   );
   return (
      <Collapsible open={open} onOpenChange={setOpen} asChild>
         <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild>
               <Link href={href}>
                  <Box size={14} />
                  <span>{tx('Projects')}</span>
               </Link>
            </SidebarMenuSubButton>
            <SectionToggle label={tx('Toggle Projects')} />
            <CollapsibleContent>
               <NavProjectList projects={projects} viewAllHref={href} />
            </CollapsibleContent>
         </SidebarMenuSubItem>
      </Collapsible>
   );
}
