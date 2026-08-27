'use client';

import * as React from 'react';

import { HelpButton } from '@/components/layout/sidebar/help-button';
import { NavInbox } from '@/components/layout/sidebar/nav-inbox';
import { NavTeams } from '@/components/layout/sidebar/nav-teams';
import { NavWorkspace } from '@/components/layout/sidebar/nav-workspace';
import { NavSettings } from '@/components/layout/sidebar/nav-settings';
import { NavTeamsSettings } from '@/components/layout/sidebar/nav-teams-settings';
import { OrgSwitcher } from '@/components/layout/sidebar/org-switcher';
import {
   Sidebar,
   SidebarContent,
   SidebarFooter,
   SidebarHeader,
   SidebarRail,
   SidebarSeparator,
} from '@/components/ui/sidebar';
import { usePathname } from 'next/navigation';
import { BackToApp } from '@/components/layout/sidebar/back-to-app';

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
   const pathname = usePathname();
   const isSettings = pathname.includes('/settings');
   return (
      <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border" {...props}>
         <SidebarHeader className="border-b border-sidebar-border/70 px-3 py-2">
            {isSettings ? <BackToApp /> : <OrgSwitcher />}
         </SidebarHeader>
         <SidebarContent className="gap-0 py-2">
            {isSettings ? (
               <>
                  <NavSettings />
                  <SidebarSeparator className="my-1" />
                  <NavTeamsSettings />
               </>
            ) : (
               <>
                  <NavInbox />
                  <SidebarSeparator className="my-1" />
                  <NavWorkspace />
                  <SidebarSeparator className="my-1" />
                  <NavTeams />
               </>
            )}
         </SidebarContent>
         <SidebarFooter className="border-t border-sidebar-border/70 px-3 py-2">
            <HelpButton />
         </SidebarFooter>
         <SidebarRail />
      </Sidebar>
   );
}
