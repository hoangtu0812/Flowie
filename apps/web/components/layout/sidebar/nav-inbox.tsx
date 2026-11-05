'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/navigation/messages.vi';
import { useApprovalsStore } from '@/features/approvals/approvals-store';

import {
   SidebarGroup,
   SidebarMenu,
   SidebarMenuBadge,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import { inboxItems } from '@/mock-data/side-bar-nav';
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
import { loadCurrentWorkspace } from '@/lib/workspaces';

const ITEM_KEYS: Record<string, SidebarItemKey> = {
   'Inbox': 'inbox',
   'Reviews': 'reviews',
   'Approvals': 'approvals',
   'My issues': 'my-issues',
   'Agent': 'agent',
};

export function NavInbox() {
   const tx = useMessages(messages);
   const { orgId } = useParams<{ orgId: string }>();
   const { visibility, badgeStyle, order } = useSidebarPrefsStore();
   const { notifications, getUnreadCount, loadNotifications, connectRealtime } =
      useNotificationsStore();
   const loadApprovals = useApprovalsStore((state) => state.load);
   const waiting = useApprovalsStore((state) => state.approvals?.waiting.length ?? 0);
   // Notifications arrive newest first, so a new document event changes this id.
   // VI: Thông báo mới nhất đứng đầu, nên có sự kiện tài liệu mới thì id này đổi.
   const latestDocumentEvent = notifications.find((item) => item.entityType === 'document')?.id;
   const [mounted, setMounted] = useState(false);
   useEffect(() => setMounted(true), []);

   useEffect(() => {
      let unsubscribe: () => void = () => undefined;
      void loadCurrentWorkspace()
         .then((workspace) => {
            void loadNotifications();
            unsubscribe = connectRealtime(workspace.id);
         })
         // The login page can render the sidebar briefly while the session is
         // changing. The Inbox will retry after authentication succeeds.
         .catch(() => undefined);
      return () => unsubscribe();
   }, [connectRealtime, loadNotifications, orgId]);

   useEffect(() => {
      void loadApprovals();
   }, [loadApprovals, orgId, latestDocumentEvent]);

   const unread = mounted ? getUnreadCount() : 0;
   const badges: Partial<Record<SidebarItemKey, number>> = {
      inbox: unread,
      approvals: mounted ? waiting : 0,
   };

   const orderedItems = mounted
      ? resolveOrder(order.personal, inboxItems.map((item) => ITEM_KEYS[item.name]).filter(Boolean))
           .map((key) => inboxItems.find((item) => ITEM_KEYS[item.name] === key))
           .filter((item): item is (typeof inboxItems)[number] => Boolean(item))
      : inboxItems;

   const items = orderedItems.filter((item) => {
      if (!mounted) return true;
      const key = ITEM_KEYS[item.name];
      if (!key) return true;
      return isSidebarItemVisible(visibility[key], badges[key] ?? 0);
   });

   return (
      <SidebarGroup className="group-data-[collapsible=icon]:hidden">
         <SidebarMenu>
            {items.map((item) => {
               const badge = badges[ITEM_KEYS[item.name]] ?? 0;
               return (
                  <SidebarMenuItem key={tx(item.name)}>
                     <SidebarMenuButton asChild>
                        <Link href={`/${orgId}${item.url.replace(/^\/lndev-ui/, '')}`}>
                           <item.icon />
                           <span>{tx(item.name)}</span>
                        </Link>
                     </SidebarMenuButton>
                     {badge > 0 && (
                        <SidebarMenuBadge className="text-muted-foreground">
                           {badgeStyle === 'count' ? (
                              badge > 99 ? (
                                 '99+'
                              ) : (
                                 badge
                              )
                           ) : (
                              <span className="size-1.5 rounded-full bg-muted-foreground inline-block" />
                           )}
                        </SidebarMenuBadge>
                     )}
                  </SidebarMenuItem>
               );
            })}
         </SidebarMenu>
      </SidebarGroup>
   );
}
