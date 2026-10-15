'use client';
import { useDateFormatter } from '@/features/shared/account-time';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/sla/messages.vi';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseEnvelope } from '@/lib/http';
import { slaApi, type SlaPolicy, type PolicyValues, type VersionPage } from './types';

type Revision = { version: number; kind: string; createdAt: string; snapshot: PolicyValues };
export function RevisionHistory({ workspace, policy }: { workspace: string; policy: SlaPolicy }) {
   const tx = useMessages(messages);
   const dateLabel = useDateFormatter();

   const [rows, setRows] = useState<Revision[]>([]),
      [page, setPage] = useState<VersionPage>();
   const [busy, setBusy] = useState(false),
      [error, setError] = useState('');
   const active = useRef(false),
      inflight = useRef(false);
   const load = async (before?: number) => {
      if (inflight.current) return;
      inflight.current = true;
      setBusy(true);
      setError('');
      try {
         const result = await responseEnvelope<Revision[], VersionPage>(
            await authenticatedFetch(
               `${slaApi}/${policy.id}/revisions?${new URLSearchParams({ workspaceId: workspace, ...(before ? { before: String(before) } : {}) })}`
            )
         );
         if (active.current) {
            setRows((previous) => (before ? [...previous, ...result.data] : result.data));
            setPage(result.meta);
         }
      } catch (reason) {
         if (active.current) setError(String(reason));
      } finally {
         if (active.current) {
            inflight.current = false;
            setBusy(false);
         }
      }
   };
   useEffect(() => {
      active.current = true;
      void load();
      return () => {
         active.current = false;
      };
   }, []);
   return (
      <VStack gap={3} width="100%">
         <Heading level={2}>
            {tx('Policy history:')} {policy.name}
         </Heading>
         <Text>
            {tx(
               'Baseline revisions describe the policy observed during upgrade; they do not recreate earlier edits.'
            )}
         </Text>
         <List hasDividers>
            {rows.map((row) => (
               <ListItem
                  key={row.version}
                  label={tx('Revision {value0} · {value1}', {
                     value0: row.version,
                     value1: row.kind,
                  })}
                  description={
                     <VStack gap={1}>
                        <Text>
                           {tx('{value0} · {value1} · {value2} working minutes', {
                              value0: dateLabel(row.createdAt),
                              value1: row.snapshot.name,
                              value2: row.snapshot.deadlineMinutes,
                           })}
                        </Text>
                        <Text>
                           {row.snapshot.calendar
                              ? row.snapshot.calendar.timezone
                              : tx('24 hours, every day')}
                        </Text>
                     </VStack>
                  }
               />
            ))}
         </List>
         {error && <Text role="alert">{error}</Text>}
         <Text>
            {page
               ? `${rows.length} of ${page.total} accessible revisions`
               : tx('Loading revisions…')}
         </Text>
         <Button
            label={tx('Refresh policy history')}
            onClick={() => void load()}
            isLoading={busy}
         />
         {page?.nextBefore && (
            <Button
               label={tx('Load more policy revisions')}
               onClick={() => void load(page.nextBefore ?? undefined)}
               isDisabled={busy}
            />
         )}
      </VStack>
   );
}
