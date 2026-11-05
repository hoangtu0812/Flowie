'use client';

import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { useMessages } from '@/features/shared/use-messages';
import { parseInstant } from '@/lib/time';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { messages } from './messages.vi';
import type { Ticket } from './service-desk-api';
import { statusLabel } from './ticket-detail';

export function TicketList({
   rows,
   selected,
   inQueue,
   unread,
   onSelect,
}: {
   rows: Ticket[];
   selected?: string;
   inQueue: boolean;
   unread?: Set<string>;
   onSelect: (ticketId: string) => void;
}) {
   const tx = useMessages(messages);
   const locale = useUiPreferencesStore((state) => state.locale);
   if (rows.length === 0) return null;
   return (
      <List hasDividers>
         {rows.map((row) => (
            <ListItem
               key={row.id}
               label={row.title}
               isSelected={row.id === selected}
               onClick={() => onSelect(row.id)}
               startContent={
                  unread?.has(row.id) ? (
                     <span
                        role="img"
                        aria-label={tx('New activity')}
                        className="size-2 rounded-full bg-primary"
                     />
                  ) : undefined
               }
               description={
                  <Text type="supporting">
                     {[
                        row.project?.name ?? row.team.name,
                        row.createdBy.name,
                        row.assignee && tx('Assigned to {name}', { name: row.assignee.name }),
                        parseInstant(row.updatedAt).toLocaleString(locale),
                     ]
                        .filter(Boolean)
                        .join(' · ')}
                  </Text>
               }
               endContent={
                  <Text type="label" className="whitespace-nowrap">
                     {tx(statusLabel(row.ticketStatus, inQueue))}
                  </Text>
               }
            />
         ))}
      </List>
   );
}
