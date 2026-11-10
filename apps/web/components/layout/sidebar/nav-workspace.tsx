'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/navigation/messages.vi';

import {
   Box,
   ChartNoAxesCombined,
   ChevronRight,
   Compass,
   ContactRound,
   FileText,
   Layers,
   LayoutList,
   LucideIcon,
   MoreHorizontal,
   Newspaper,
   UserRound,
} from 'lucide-react';

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
} from '@/components/ui/sidebar';
import {
   isSidebarItemVisible,
   resolveOrder,
   SidebarItemKey,
   useSidebarPrefsStore,
} from '@/store/sidebar-prefs-store';
import { useSidebarSection } from '@/store/sidebar-collapse-store';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CustomizeSidebarDialog } from './customize-sidebar-dialog';
import { isProjectPage, NavProjectList, useSidebarProjects } from './nav-project-list';

interface WorkspaceNavItem {
   key: SidebarItemKey;
   name: string;
   icon: LucideIcon;
   /** Path under /{orgId}. */
   url: string;
}

const WORKSPACE_NAV: WorkspaceNavItem[] = [
   { key: 'dashboard', name: 'Dashboard', icon: ChartNoAxesCombined, url: '/dashboard' },
   { key: 'issues', name: 'All issues', icon: LayoutList, url: '/issues' },
   { key: 'initiatives', name: 'Initiatives', icon: Compass, url: '/initiatives' },
   { key: 'projects', name: 'Projects', icon: Box, url: '/projects' },
   { key: 'docs', name: 'Docs', icon: FileText, url: '/docs' },
   { key: 'news', name: 'News', icon: Newspaper, url: '/news' },
   { key: 'views', name: 'Views', icon: Layers, url: '/views' },
   { key: 'teams', name: 'Teams', icon: ContactRound, url: '/teams' },
   { key: 'members', name: 'Members', icon: UserRound, url: '/members' },
];

export function NavWorkspace() {
   const tx = useMessages(messages);
   const { orgId } = useParams<{ orgId: string }>();
   const { visibility, order } = useSidebarPrefsStore();
   const [customizeOpen, setCustomizeOpen] = useState(false);
   const [mounted, setMounted] = useState(false);
   useEffect(() => setMounted(true), []);

   const orderedNav = mounted
      ? resolveOrder(
           order.workspace,
           WORKSPACE_NAV.map((item) => item.key)
        )
           .map((key) => WORKSPACE_NAV.find((item) => item.key === key))
           .filter((item): item is WorkspaceNavItem => Boolean(item))
      : WORKSPACE_NAV;

   const items = orderedNav.filter((item) =>
      mounted ? isSidebarItemVisible(visibility[item.key], 0) : true
   );
   const hidden = mounted
      ? orderedNav.filter((item) => !isSidebarItemVisible(visibility[item.key], 0))
      : [];

   // A page inside a collapsed section opens it: a project from the list opens Projects and
   // Workspace, any visible Workspace entry opens Workspace.
   // VI: Trang nằm trong khối đang thu gọn sẽ mở khối đó: dự án trong danh sách mở Projects và
   // VI: Workspace, mục Workspace đang hiển thị mở Workspace.
   const pathname = usePathname();
   const projects = useSidebarProjects();
   const onProject = isProjectPage(pathname, orgId, projects);
   const [open, setOpen] = useSidebarSection(
      'workspace',
      onProject || items.some((item) => pathname.startsWith(`/${orgId}${item.url}`))
   );
   const [projectsOpen, setProjectsOpen] = useSidebarSection('workspace-projects', onProject);

   return (
      <Collapsible
         open={open}
         onOpenChange={setOpen}
         asChild
         className="group/workspace group-data-[collapsible=icon]:hidden"
      >
         <SidebarGroup>
            <SidebarGroupLabel asChild className="w-full">
               <CollapsibleTrigger>
                  {tx('Workspace')}
                  <ChevronRight className="ml-auto transition-transform group-data-[state=open]/workspace:rotate-90" />
               </CollapsibleTrigger>
            </SidebarGroupLabel>
            <CollapsibleContent>
               <SidebarMenu>
                  {items.map((item) =>
                     item.key === 'projects' ? (
                        <Collapsible
                           key={item.key}
                           open={projectsOpen}
                           onOpenChange={setProjectsOpen}
                           asChild
                        >
                           <SidebarMenuItem>
                              <SidebarMenuButton asChild>
                                 <Link href={`/${orgId}${item.url}`}>
                                    <item.icon />
                                    <span>{tx(item.name)}</span>
                                 </Link>
                              </SidebarMenuButton>
                              <CollapsibleTrigger asChild>
                                 <SidebarMenuAction
                                    aria-label={tx('Toggle Projects')}
                                    className="data-[state=open]:rotate-90"
                                 >
                                    <ChevronRight />
                                 </SidebarMenuAction>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                 <NavProjectList
                                    projects={projects}
                                    viewAllHref={`/${orgId}/projects`}
                                 />
                              </CollapsibleContent>
                           </SidebarMenuItem>
                        </Collapsible>
                     ) : (
                        <SidebarMenuItem key={item.key}>
                           <SidebarMenuButton asChild>
                              <Link href={`/${orgId}${item.url}`}>
                                 <item.icon />
                                 <span>{tx(item.name)}</span>
                              </Link>
                           </SidebarMenuButton>
                        </SidebarMenuItem>
                     )
                  )}
                  <SidebarMenuItem>
                     <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                           <SidebarMenuButton asChild>
                              <span>
                                 <MoreHorizontal />
                                 <span>{tx('More')}</span>
                              </span>
                           </SidebarMenuButton>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                           className="w-48 rounded-lg"
                           side="bottom"
                           align="start"
                        >
                           {hidden.map((item) => (
                              <DropdownMenuItem key={item.key} asChild>
                                 <Link href={`/${orgId}${item.url}`}>
                                    <item.icon className="text-muted-foreground" />
                                    <span>{tx(item.name)}</span>
                                 </Link>
                              </DropdownMenuItem>
                           ))}
                           {hidden.length > 0 && <DropdownMenuSeparator />}
                           <DropdownMenuItem onClick={() => setCustomizeOpen(true)}>
                              <LayoutList className="text-muted-foreground" />
                              <span>Customize sidebar</span>
                           </DropdownMenuItem>
                        </DropdownMenuContent>
                     </DropdownMenu>
                  </SidebarMenuItem>
               </SidebarMenu>
            </CollapsibleContent>
            <CustomizeSidebarDialog open={customizeOpen} onOpenChange={setCustomizeOpen} />
         </SidebarGroup>
      </Collapsible>
   );
}
