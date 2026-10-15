'use client';
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
      total: 'Accessible tasks',
      active: 'Active clocks',
      paused: 'Paused clocks',
      breached: 'Cycles with a breach',
      completed_on_time: 'Completed on time',
      completed_late: 'Completed late',
      manual: 'Manual deadlines',
      unmanaged: 'Unmanaged or restricted clocks',
      inactive: 'Canceled, overridden or unavailable',
      pending_events: 'Lifecycle events awaiting processing',
   };
   return (
      <VStack gap={3} width="100%">
         <Heading level={2}>SLA compliance</Heading>
         <Selector
            label="SLA report team"
            value={team}
            options={[
               { value: '', label: 'All accessible teams' },
               ...teams.map((row) => ({ value: row.id, label: row.name })),
            ]}
            onChange={setTeam}
            width="100%"
         />
         <Text>
            All currently accessible, non-archived tasks; the latest cycle of each task. Compliance
            includes only completed tracked cycles. Manual deadlines do not create clocks; an
            earlier completed cycle keeps its result.
         </Text>
         {data ? (
            <>
               <Text>
                  {data.compliancePercent === null
                     ? 'No completed tracked cycles yet.'
                     : `Compliance: ${data.compliancePercent}%`}
               </Text>
               <List density="compact" hasDividers>
                  {Object.entries(labels).map(([key, label]) => (
                     <ListItem key={key} label={label} description={String(data[key] ?? 0)} />
                  ))}
               </List>
            </>
         ) : (
            <Text>{error ? 'Report unavailable.' : 'Loading report…'}</Text>
         )}
         {error && <Text role="alert">{error}</Text>}
         <Button label="Refresh SLA report" onClick={() => setRetry((value) => value + 1)} />
      </VStack>
   );
}
