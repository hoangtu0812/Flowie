'use client';

import { ClipboardList, Inbox, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
   SidebarGroup,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';

const items = [
   { label: 'Inbox', path: '/inbox', icon: Inbox },
   { label: 'My issues', path: '/my-issues', icon: ClipboardList },
   { label: 'Agent', path: '/agent', icon: Sparkles },
];

export function NavInbox() {
   const { orgId } = useParams<{ orgId: string }>();
   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarMenu>
            {items.map((item) => (
               <SidebarMenuItem key={item.label}>
                  <SidebarMenuButton asChild>
                     <Link href={`/${orgId}${item.path}`}>
                        <item.icon />
                        <span>{item.label}</span>
                     </Link>
                  </SidebarMenuButton>
               </SidebarMenuItem>
            ))}
         </SidebarMenu>
      </SidebarGroup>
   );
}
