'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getNotificationIcon } from '@/lib/notification-utils';
import type { InboxNotification } from '@/store/notifications-store';
import { useNotificationsStore } from '@/store/notifications-store';
import { ArrowUpRight, Check } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { NotificationBox } from './icons/motification-box';

interface IssuePreviewProps {
   notification?: InboxNotification;
   onMarkAsRead?: (id: string) => Promise<void>;
}

const destinationFor = (orgId: string, notification: InboxNotification) => {
   if (notification.entityType === 'issue' && notification.identifier !== 'ISSUE') {
      return `/${orgId}/issue/${notification.identifier}`;
   }
   if (notification.entityType === 'project') {
      return `/${orgId}/project/${notification.entityId}/overview`;
   }
   return undefined;
};

export default function IssuePreview({ notification, onMarkAsRead }: IssuePreviewProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const { getUnreadCount } = useNotificationsStore();

   if (!notification) {
      const unreadCount = getUnreadCount();
      return (
         <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <NotificationBox className="w-16 h-16 mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold text-muted-foreground mb-2">
               {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm">
               Select a notification from the list to view its details and take action.
            </p>
         </div>
      );
   }

   const destination = destinationFor(orgId ?? 'lndev-ui', notification);
   const initials = notification.user.name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2);

   return (
      <div className="flex flex-col h-full overflow-hidden">
         <div className="flex items-center justify-between px-4 h-10 border-b border-border shrink-0">
            <div className="flex items-center gap-2 min-w-0">
               {getNotificationIcon(notification.type, 'size-4')}
               <span className="text-sm font-medium truncate">{notification.identifier}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
               {!notification.read && onMarkAsRead && (
                  <Button
                     variant="outline"
                     size="xs"
                     onClick={() => void onMarkAsRead(notification.id)}
                     className="gap-1"
                  >
                     <Check className="size-4" />
                     Mark as read
                  </Button>
               )}
               {destination && (
                  <Button variant="ghost" size="xs" asChild>
                     <Link href={destination}>
                        Open
                        <ArrowUpRight className="size-3.5 ml-0.5" />
                     </Link>
                  </Button>
               )}
            </div>
         </div>

         <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="pt-8 pb-6 px-6 w-full max-w-3xl mx-auto">
               <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg mb-8">
                  <div className="relative shrink-0">
                     <Avatar className="size-7">
                        <AvatarImage
                           src={notification.user.avatarUrl ?? undefined}
                           alt={notification.user.name}
                        />
                        <AvatarFallback className="text-xs">{initials || 'F'}</AvatarFallback>
                     </Avatar>
                     <div className="absolute -bottom-1 -right-1 size-4 rounded-full bg-accent border border-background flex items-center justify-center">
                        {getNotificationIcon(notification.type, 'size-2.5')}
                     </div>
                  </div>
                  <div className="min-w-0 text-sm">
                     <span className="font-medium">{notification.user.name}</span>{' '}
                     <span className="text-muted-foreground">· {notification.timestamp}</span>
                     <p className="text-foreground/90 mt-0.5">{notification.content}</p>
                  </div>
               </div>

               <h3 className="text-2xl font-semibold text-foreground text-balance">
                  {notification.title}
               </h3>
               <dl className="mt-6 grid max-w-xl grid-cols-[8rem_1fr] gap-y-3 text-sm">
                  <dt className="text-muted-foreground">Entity</dt>
                  <dd className="capitalize">{notification.entityType}</dd>
                  <dt className="text-muted-foreground">Received</dt>
                  <dd>
                     {new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                     }).format(new Date(notification.createdAt))}
                  </dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{notification.read ? 'Read' : 'Unread'}</dd>
               </dl>
            </div>
         </div>
      </div>
   );
}
