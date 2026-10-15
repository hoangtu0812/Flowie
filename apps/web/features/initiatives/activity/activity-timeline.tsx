'use client';

import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { InlineText } from '@/components/common/issues/details/content-blocks';
import { useAccountTime, useDateFormatter } from '@/features/shared/account-time';
import { useMessages } from '@/features/shared/use-messages';
import { parseInstant } from '@/lib/time';
import { groupActivityByMonth } from './group-activity';
import { HealthBadge } from './health-badge';
import { messages } from './messages.vi';
import type { InitiativeUpdate, InitiativeAuditEvent } from './types';

const actionLabels = {
   'initiative.created': 'Created the initiative',
   'initiative.updated': 'Updated initiative properties',
   'initiative.archived': 'Archived the initiative',
   'initiative.project.linked': 'Linked a project',
   'initiative.project.unlinked': 'Unlinked a project',
   'initiative.label.linked': 'Added a label',
   'initiative.label.unlinked': 'Removed a label',
   'initiative.update.posted': 'Posted an update',
   'initiative.resource.added': 'Added a resource',
} as const;

export function ActivityTimeline({
   items,
}: {
   items: (InitiativeUpdate | InitiativeAuditEvent)[];
}) {
   const { locale, timezone } = useAccountTime();
   const tx = useMessages(messages);
   const fullDate = useDateFormatter();
   const shortDate = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: timezone,
   });
   return (
      <VStack gap={8}>
         {groupActivityByMonth(items, locale, timezone).map((group) => (
            <VStack as="section" key={group.key} gap={3} aria-label={group.label}>
               <h2 className="text-lg font-semibold">{group.label}</h2>
               {group.rows.map((row) => {
                  const update = 'body' in row;
                  const person = update ? row.author : row.actor;
                  const name = person?.name ?? tx('System');
                  const instant = parseInstant(row.createdAt);
                  return (
                     <VStack
                        as="article"
                        key={row.id}
                        gap={3}
                        className={
                           update ? 'border rounded-lg p-4 min-w-0' : 'border-b py-4 min-w-0'
                        }
                     >
                        <HStack align="center" gap={2} wrap="wrap">
                           <Avatar className="size-5 shrink-0">
                              <AvatarImage src={person?.avatarUrl ?? undefined} alt="" />
                              <AvatarFallback>{name.slice(0, 1)}</AvatarFallback>
                           </Avatar>
                           <p className="text-sm font-medium break-words min-w-0">{name}</p>
                           <time
                              className="text-xs text-muted-foreground"
                              dateTime={row.createdAt}
                              title={fullDate(row.createdAt)}
                           >
                              {Number.isFinite(instant.getTime()) ? shortDate.format(instant) : '—'}
                           </time>
                           {update && (
                              <HStack className="ml-auto">
                                 <HealthBadge health={row.health} />
                              </HStack>
                           )}
                        </HStack>
                        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                           {update ? (
                              <InlineText text={row.body} />
                           ) : (
                              tx(
                                 actionLabels[row.action as keyof typeof actionLabels] ??
                                    'Changed the initiative'
                              )
                           )}
                        </p>
                     </VStack>
                  );
               })}
            </VStack>
         ))}
      </VStack>
   );
}
