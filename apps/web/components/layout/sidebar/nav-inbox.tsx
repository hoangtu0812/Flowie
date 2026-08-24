'use client';

import {
   SidebarGroup,
   SidebarMenu,
   SidebarMenuBadge,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { useNotificationsStore } from '@/store/notifications-store';
import {
   isSidebarItemVisible,
   resolveOrder,
   SidebarItemKey,
   useSidebarPrefsStore,
} from '@/store/sidebar-prefs-store';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Bot, FolderKanban, GitPullRequestArrow, Inbox } from 'lucide-react';

const inboxItems = [
   { name: 'Inbox', url: '/inbox', icon: Inbox, available: true },
   {
      name: 'Reviews',
      url: '/reviews',
      icon: GitPullRequestArrow,
      available: false,
      unavailableReason: 'Code reviews are not available',
   },
   { name: 'My issues', url: '/my-issues', icon: FolderKanban, available: true },
   {
      name: 'Agent',
      url: '/agent',
      icon: Bot,
      available: false,
      unavailableReason: 'AI Agent is not available yet',
   },
] as const;

const ITEM_KEYS: Record<string, SidebarItemKey> = {
   'Inbox': 'inbox',
   'Reviews': 'reviews',
   'My issues': 'my-issues',
   'Agent': 'agent',
};

export function NavInbox() {
   const { orgId } = useParams<{ orgId: string }>();
   const { visibility, badgeStyle, order } = useSidebarPrefsStore();
   const { getUnreadCount, loadNotifications } = useNotificationsStore();
   const [mounted, setMounted] = useState(false);
   useEffect(() => {
      setMounted(true);
      void loadNotifications();
   }, [loadNotifications]);

   const unread = mounted ? getUnreadCount() : 0;

   const orderedItems = mounted
      ? resolveOrder(order.personal, inboxItems.map((item) => ITEM_KEYS[item.name]).filter(Boolean))
           .map((key) => inboxItems.find((item) => ITEM_KEYS[item.name] === key))
           .filter((item): item is (typeof inboxItems)[number] => Boolean(item))
      : inboxItems;

   const items = orderedItems.filter((item) => {
      if (!mounted) return true;
      const key = ITEM_KEYS[item.name];
      if (!key) return true;
      const badge = key === 'inbox' ? unread : 0;
      return isSidebarItemVisible(visibility[key], badge);
   });

   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarMenu>
            {items.map((item) => (
               <SidebarMenuItem key={item.name}>
                  <SidebarMenuButton asChild>
                     {item.available ? (
                        <Link href={`/${orgId}${item.url}`}>
                           <item.icon />
                           <span>{item.name}</span>
                        </Link>
                     ) : (
                        <span
                           className="flex items-center gap-2 opacity-50 cursor-not-allowed"
                           title={item.unavailableReason}
                           aria-disabled="true"
                        >
                           <item.icon />
                           <span>{item.name}</span>
                        </span>
                     )}
                  </SidebarMenuButton>
                  {mounted && item.name === 'Inbox' && unread > 0 && (
                     <SidebarMenuBadge className="text-muted-foreground">
                        {badgeStyle === 'count' ? (
                           unread > 99 ? (
                              '99+'
                           ) : (
                              unread
                           )
                        ) : (
                           <span className="size-1.5 rounded-full bg-muted-foreground inline-block" />
                        )}
                     </SidebarMenuBadge>
                  )}
               </SidebarMenuItem>
            ))}
         </SidebarMenu>
      </SidebarGroup>
   );
}
