'use client';

import Link from 'next/link';
import { Building2, ChevronLeft, LayoutDashboard, LogOut, Users } from 'lucide-react';

import { FlowieLogo } from '@/components/brand/flowie-logo';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Badge } from '@/components/ui/badge';
import {
   Sidebar,
   SidebarContent,
   SidebarFooter,
   SidebarGroup,
   SidebarGroupContent,
   SidebarGroupLabel,
   SidebarHeader,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
   SidebarRail,
} from '@/components/ui/sidebar';

export type AdminSection = 'overview' | 'users' | 'workspaces';

const navigation = [
   { id: 'overview', label: 'Overview', icon: LayoutDashboard },
   { id: 'users', label: 'Users', icon: Users },
   { id: 'workspaces', label: 'Workspaces', icon: Building2 },
] satisfies { id: AdminSection; label: string; icon: typeof LayoutDashboard }[];

export function AdminSidebar({
   activeSection,
   appHref,
   onNavigate,
   onLogout,
}: {
   activeSection: AdminSection;
   appHref: string;
   onNavigate: (section: AdminSection) => void;
   onLogout: () => void;
}) {
   return (
      <Sidebar collapsible="offcanvas" className="border-r border-sidebar-border">
         <SidebarHeader className="border-b border-sidebar-border/70 px-3 py-2">
            <div className="flex h-8 items-center justify-between gap-2 px-1">
               <div className="flex min-w-0 items-center gap-2">
                  <FlowieLogo className="[&>svg]:size-6" />
                  <span className="truncate text-sm font-semibold">Flowie</span>
                  <Badge variant="secondary" className="h-5 px-1.5 text-[10px] uppercase">
                     Admin
                  </Badge>
               </div>
               <ThemeToggle />
            </div>
         </SidebarHeader>

         <SidebarContent className="gap-0 py-2">
            <SidebarGroup>
               <SidebarGroupLabel>Platform</SidebarGroupLabel>
               <SidebarGroupContent>
                  <SidebarMenu>
                     {navigation.map(({ id, label, icon: Icon }) => (
                        <SidebarMenuItem key={id}>
                           <SidebarMenuButton
                              type="button"
                              isActive={activeSection === id}
                              onClick={() => onNavigate(id)}
                           >
                              <Icon />
                              <span>{label}</span>
                           </SidebarMenuButton>
                        </SidebarMenuItem>
                     ))}
                  </SidebarMenu>
               </SidebarGroupContent>
            </SidebarGroup>
         </SidebarContent>

         <SidebarFooter className="border-t border-sidebar-border/70 px-3 py-2">
            <SidebarMenu>
               <SidebarMenuItem>
                  <SidebarMenuButton asChild>
                     <Link href={appHref}>
                        <ChevronLeft />
                        <span>Back to app</span>
                     </Link>
                  </SidebarMenuButton>
               </SidebarMenuItem>
               <SidebarMenuItem>
                  <SidebarMenuButton type="button" onClick={onLogout}>
                     <LogOut />
                     <span>Log out</span>
                  </SidebarMenuButton>
               </SidebarMenuItem>
            </SidebarMenu>
         </SidebarFooter>
         <SidebarRail />
      </Sidebar>
   );
}
