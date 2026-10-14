'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { DesignSurface } from '@/components/common/design-surface';
import { QueryState } from '@/components/common/query-state';
import { LoadingState } from '@/components/common/loading-state';
import { IssueContent } from '@/features/issues/issue-content';
import { useIssuesStore } from '@/store/issues-store';
import type { InboxItem } from '@/store/notifications-store';

export function NotificationPreview({
   notification,
   onMarkAsRead,
}: {
   notification?: InboxItem;
   onMarkAsRead?: (id: string) => unknown;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const { loadIssue, issues, error } = useIssuesStore();
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
               <EmptyState
                  title="Select a notification"
                  description="Choose an item to read its context and take action."
               />
            ) : (
               <>
                  <HStack padding={3} gap={3} justify="between">
                     <Text>
                        {notification.user.name} · {notification.timestamp}
                     </Text>
                     <HStack gap={2}>
                        {!notification.read && onMarkAsRead && (
                           <Button
                              label="Mark as read"
                              onClick={() => {
                                 void onMarkAsRead(notification.id);
                              }}
                           />
                        )}
                        {safePath && <Link href={`/${orgId}${safePath}`}>Open</Link>}
                     </HStack>
                  </HStack>
                  <Text>{notification.content}</Text>
                  {reference ? (
                     pending ? (
                        <LoadingState label="Loading issue…" />
                     ) : error ? (
                        <QueryState message={error} onRetry={() => loadIssue(reference)} />
                     ) : issue ? (
                        <IssueContent key={issue.id} issue={issue} orgId={orgId} compact />
                     ) : (
                        <QueryState message="The issue is unavailable or outside your access." />
                     )
                  ) : (
                     <EmptyState
                        title={notification.title}
                        description="Open the linked item to view its current details."
                     />
                  )}
               </>
            )}
         </VStack>
      </DesignSurface>
   );
}
