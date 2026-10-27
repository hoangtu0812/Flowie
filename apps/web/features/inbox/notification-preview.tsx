'use client';
import { useLocale } from '@/features/shared/use-locale';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { Check, ArrowUpRight, Clock } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { getNotificationIcon } from '@/lib/notification-utils';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { DesignSurface } from '@/components/common/design-surface';
import { QueryState } from '@/components/common/query-state';
import { LoadingState } from '@/components/common/loading-state';
import { IssueContent } from '@/features/issues/issue-content';
import { useIssuesStore } from '@/store/issues-store';
import { useNotificationsStore } from '@/store/notifications-store';
import type { InboxItem } from '@/store/notifications-store';

export function NotificationPreview({
   notification,
   onMarkAsRead,
}: {
   notification?: InboxItem;
   onMarkAsRead?: (id: string) => unknown;
}) {
   const { t, tag } = useLocale();
   const { orgId } = useParams<{ orgId: string }>();
   const { loadIssue, issues, error } = useIssuesStore();
   const snooze = useNotificationsStore((state) => state.snooze);
   const [actionError, setActionError] = useState<string>();
   const [pending, setPending] = useState(false);
   const reference = notification?.entityType === 'issue' ? notification.entityId : undefined;
   useEffect(() => {
      let active = true;
      if (!reference) return;
      setPending(true);
      void loadIssue(reference).finally(() => {
         if (active) setPending(false);
      });
      return () => {
         active = false;
      };
   }, [loadIssue, reference, orgId]);
   const issue = reference ? issues.find((item) => item.id === reference) : undefined;
   const path = issue ? `/issue/${issue.identifier}` : notification?.entityPath;
   const safePath = path?.startsWith('/') && !path.startsWith('//') ? path : undefined;
   return (
      <DesignSurface>
         <VStack height="100%" gap={0}>
            {!notification ? (
               <EmptyState title={t('selectNotification')} description={t('notificationHelp')} />
            ) : (
               <>
                  <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
                     <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                        {getNotificationIcon(notification.type, 'size-4 shrink-0')}
                        <span className="truncate">
                           {issue?.identifier ?? notification.identifier}
                        </span>
                     </div>
                     <div className="flex shrink-0 items-center gap-1">
                        <Button
                           label={notification.snoozedUntil ? t('unsnooze') : t('snoozeHour')}
                           tooltip={notification.snoozedUntil ? t('unsnooze') : t('snoozeHour')}
                           icon={<Clock className="size-4" />}
                           isIconOnly
                           variant="ghost"
                           size="sm"
                           clickAction={async () => {
                              try {
                                 await snooze(
                                    notification.id,
                                    notification.snoozedUntil ? null : 60
                                 );
                                 setActionError(undefined);
                              } catch (reason) {
                                 setActionError(
                                    reason instanceof Error
                                       ? reason.message
                                       : 'Could not snooze notification.'
                                 );
                              }
                           }}
                        />
                        {!notification.read && onMarkAsRead && (
                           <Button
                              label={t('markRead')}
                              icon={<Check className="size-4" />}
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                 void onMarkAsRead(notification.id);
                              }}
                           />
                        )}
                        {safePath && (
                           <Link
                              href={`/${orgId}${safePath}`}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium hover:bg-accent"
                           >
                              {t('open')}
                              <ArrowUpRight className="size-4" />
                           </Link>
                        )}
                     </div>
                  </div>
                  {actionError && <Text role="alert">{actionError}</Text>}
                  {notification.snoozedUntil && (
                     <Text>
                        {t('snoozedUntil')}{' '}
                        {new Date(notification.snoozedUntil).toLocaleString(tag)}
                     </Text>
                  )}
                  <div className="mx-4 mt-4 flex gap-3 rounded-lg bg-muted/40 p-3">
                     <Avatar className="size-7 shrink-0">
                        <AvatarImage
                           src={notification.user.avatarUrl}
                           alt={notification.user.name}
                        />
                        <AvatarFallback className="text-xs">
                           {notification.user.name
                              .split(' ')
                              .map((part) => part[0])
                              .join('')}
                        </AvatarFallback>
                     </Avatar>
                     <div className="min-w-0 text-sm">
                        <p>
                           <span className="font-medium">{notification.user.name}</span>
                           <span className="text-muted-foreground">
                              {' '}
                              · {notification.timestamp}
                           </span>
                        </p>
                        <p className="whitespace-pre-wrap break-words text-muted-foreground">
                           {notification.content}
                        </p>
                     </div>
                  </div>
                  {reference ? (
                     pending ? (
                        <LoadingState label={t('loadingIssue')} />
                     ) : error ? (
                        <QueryState message={error} onRetry={() => loadIssue(reference)} />
                     ) : issue ? (
                        <IssueContent key={issue.id} issue={issue} orgId={orgId} compact />
                     ) : (
                        <QueryState message="The issue is unavailable or outside your access." />
                     )
                  ) : (
                     <EmptyState title={notification.title} description={t('openLinkedItem')} />
                  )}
               </>
            )}
         </VStack>
      </DesignSurface>
   );
}
