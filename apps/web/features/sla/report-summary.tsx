'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/sla/messages.vi';

import { useEffect, useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { SettingsSection } from '@/features/settings/shared';
import { RefreshIconButton } from '@/features/shared/refresh-icon-button';
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
      <SettingsSection
         title={tx('SLA compliance')}
         description={tx(
            'All currently accessible, non-archived tasks; the latest cycle of each task. Compliance includes only completed tracked cycles. Manual deadlines do not create clocks; an earlier completed cycle keeps its result.'
         )}
      >
         <div className="flex flex-wrap items-center gap-2">
            <Selector
               label={tx('SLA report team')}
               isLabelHidden
               size="sm"
               width={220}
               value={team}
               options={[
                  { value: '', label: tx('All accessible teams') },
                  ...teams.map((row) => ({ value: row.id, label: row.name })),
               ]}
               onChange={setTeam}
            />
            <RefreshIconButton
               label={tx('Refresh SLA report')}
               onClick={() => setRetry((value) => value + 1)}
            />
         </div>
         {data ? (
            <>
               <Text weight="semibold">
                  {data.compliancePercent === null
                     ? tx('No completed tracked cycles yet.')
                     : tx('Compliance: {percent}%', { percent: data.compliancePercent })}
               </Text>
               {/* Stat cards in the same style as MCP logs; a narrow screen shows two per row.
                   VI: Thẻ số liệu cùng kiểu trang MCP logs; màn hình hẹp hiện hai thẻ mỗi hàng. */}
               <Grid columns={{ minWidth: 150, max: 5 }} gap={3} width="100%">
                  {Object.entries(labels).map(([key, label]) => (
                     <Card key={key} padding={3}>
                        <VStack gap={1} role="group" aria-label={label}>
                           <Text type="supporting" color="secondary">
                              {label}
                           </Text>
                           <Text size="xl" weight="semibold" hasTabularNumbers>
                              {String(data[key] ?? 0)}
                           </Text>
                        </VStack>
                     </Card>
                  ))}
               </Grid>
            </>
         ) : (
            <Text>{error ? tx('Report unavailable.') : tx('Loading report…')}</Text>
         )}
         {error && <Text role="alert">{error}</Text>}
      </SettingsSection>
   );
}
