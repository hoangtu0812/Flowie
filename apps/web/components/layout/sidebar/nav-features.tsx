'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/navigation/messages.vi';

import Link from 'next/link';

import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { featuresItems } from '@/mock-data/side-bar-nav';

export function NavFeatures() {
   const tx = useMessages(messages);
   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarGroupLabel>{tx('Features')}</SidebarGroupLabel>
         <SidebarMenu>
            {featuresItems.map((item) => (
               <SidebarMenuItem key={tx(item.name)}>
                  <SidebarMenuButton asChild>
                     <Link href={item.url}>
                        <item.icon className="size-4" />
                        <span>{tx(item.name)}</span>
                     </Link>
                  </SidebarMenuButton>
               </SidebarMenuItem>
            ))}
         </SidebarMenu>
      </SidebarGroup>
   );
}
