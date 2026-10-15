'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/sla/messages.vi';

import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { Selector } from '@astryxdesign/core/Selector';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { slaApi } from './types';

export function SlaReportSummary({
   workspace,
   teams,
}: {
   workspace: string;
   teams: { id: string; name: string }[];
}) {
   const tx = useMessages(messages);

   const [team, setTeam] = useState('');
   const [data, setData] = useState<Record<string, number | null>>(),
      [error, setError] = useState(''),
      [retry, setRetry] = useState(0);
   useEffect(() => {
      let active = true;
      setError('');
      setData(undefined);
      void authenticatedFetch(
         `${slaApi}/report?${new URLSearchParams({ workspaceId: workspace })}`,
         {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ teamId: team || null }),
         }
      )
         .then((response) => responseData<Record<string, number | null>>(response))
         .then((value) => {
            if (active) setData(value);
         })
         .catch((reason) => {
            if (active) setError(String(reason));
         });
      return () => {
         active = false;
      };
   }, [workspace, team, retry]);
   const labels: Record<string, string> = {
      total: tx('Accessible tasks'),
      active: tx('Active clocks'),
      paused: tx('Paused clocks'),
      breached: tx('Cycles with a breach'),
      completed_on_time: tx('Completed on time'),
      completed_late: tx('Completed late'),
      manual: tx('Manual deadlines'),
      unmanaged: tx('Unmanaged or restricted clocks'),
      inactive: tx('Canceled, overridden or unavailable'),
      pending_events: tx('Lifecycle events awaiting processing'),
   };
   return (
      <VStack gap={3} width="100%">
         <Heading level={2}>{tx('SLA compliance')}</Heading>
         <Selector
            label={tx('SLA report team')}
            value={team}
            options={[
               { value: '', label: tx('All accessible teams') },
               ...teams.map((row) => ({ value: row.id, label: row.name })),
            ]}
            onChange={setTeam}
            width="100%"
         />
         <Text>
            {tx(
               'All currently accessible, non-archived tasks; the latest cycle of each task. Compliance includes only completed tracked cycles. Manual deadlines do not create clocks; an earlier completed cycle keeps its result.'
            )}
         </Text>
         {data ? (
            <>
               <Text>
                  {data.compliancePercent === null
                     ? tx('No completed tracked cycles yet.')
                     : tx('Compliance: {percent}%', { percent: data.compliancePercent })}
               </Text>
               <List density="compact" hasDividers>
                  {Object.entries(labels).map(([key, label]) => (
                     <ListItem key={key} label={label} description={String(data[key] ?? 0)} />
                  ))}
               </List>
            </>
         ) : (
            <Text>{error ? tx('Report unavailable.') : tx('Loading report…')}</Text>
         )}
         {error && <Text role="alert">{error}</Text>}
         <Button label={tx('Refresh SLA report')} onClick={() => setRetry((value) => value + 1)} />
      </VStack>
   );
}
