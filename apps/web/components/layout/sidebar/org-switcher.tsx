'use client';

import * as React from 'react';
import { ChevronsUpDown } from 'lucide-react';

import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuGroup,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuShortcut,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar';
import { ThemeToggle } from '../theme-toggle';
import { FlowieLogo } from '@/components/brand/flowie-logo';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

export function OrgSwitcher() {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const [workspaceName, setWorkspaceName] = React.useState('Flowie');

   async function logout() {
      await fetch(
         `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/auth/logout`,
         {
            method: 'POST',
            credentials: 'include',
         }
      );
      router.replace('/login');
      router.refresh();
   }

   React.useEffect(() => {
      void fetch(
         `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/workspaces/me`,
         {
            credentials: 'include',
         }
      )
         .then(async (response) => {
            if (!response.ok) return;
            const payload = (await response.json()) as {
               data: Array<{ workspace: { name: string } }>;
            };
            if (payload.data[0]?.workspace.name) setWorkspaceName(payload.data[0].workspace.name);
         })
         .catch(() => undefined);
   }, []);

   return (
      <SidebarMenu>
         <SidebarMenuItem>
            <DropdownMenu>
               <div className="w-full flex gap-1 items-center pt-2">
                  <DropdownMenuTrigger asChild>
                     <SidebarMenuButton
                        size="lg"
                        className="h-8 p-1 data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                     >
                        <FlowieLogo />
                        <div className="grid flex-1 text-left text-sm leading-tight">
                           <span className="truncate font-semibold">{workspaceName}</span>
                        </div>
                        <ChevronsUpDown className="ml-auto" />
                     </SidebarMenuButton>
                  </DropdownMenuTrigger>

                  <ThemeToggle />
               </div>
               <DropdownMenuContent
                  className="w-[--radix-dropdown-menu-trigger-width] min-w-60 rounded-lg"
                  side="bottom"
                  align="end"
                  sideOffset={4}
               >
                  <DropdownMenuGroup>
                     <DropdownMenuItem asChild>
                        <Link href={`/${orgId}/settings`}>
                           Settings
                           <DropdownMenuShortcut>G then S</DropdownMenuShortcut>
                        </Link>
                     </DropdownMenuItem>
                     <DropdownMenuItem asChild>
                        <Link href={`/${orgId}/teams`}>Teams and members</Link>
                     </DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={logout}>
                     Log out
                     <DropdownMenuShortcut>⌥⇧Q</DropdownMenuShortcut>
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
         </SidebarMenuItem>
      </SidebarMenu>
   );
}
