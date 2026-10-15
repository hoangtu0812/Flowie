'use client';
import { useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { Selector } from '@astryxdesign/core/Selector';
import { DesignSurface } from '@/components/common/design-surface';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { ResourcePagination } from '@/features/shared/resource-pagination';

type Event = {
   id: string;
   body?: string;
   action?: string;
   createdAt: string;
   author?: { name: string };
   actor?: { name: string };
};
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export function InitiativeHistory({ workspace, id }: { workspace: string; id: string }) {
   const [kind, setKind] = useState('updates');
   const history = usePagedResource<Event>(
      `${api}/initiatives/${id}/${kind}?workspaceId=${workspace}`
   );
   return (
      <DesignSurface>
         <VStack padding={6} gap={4} className="h-full overflow-auto" width="100%">
            <Heading level={2}>Initiative history</Heading>
            <Selector
               label="History type"
               value={kind}
               onChange={setKind}
               options={[
                  { value: 'updates', label: 'Updates' },
                  { value: 'activity', label: 'Audit activity' },
               ]}
            />
            <List hasDividers>
               {history.items.map((row) => (
                  <ListItem
                     key={row.id}
                     label={`${row.author?.name ?? row.actor?.name ?? 'System'} · ${new Date(row.createdAt).toLocaleString()}`}
                     description={row.body ?? row.action}
                  />
               ))}
            </List>
            {!history.loading && !history.error && !history.items.length && (
               <Text>No history yet.</Text>
            )}
            <ResourcePagination count={history.items.length} {...history} label="history events" />
         </VStack>
      </DesignSurface>
   );
}
