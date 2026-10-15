'use client';
import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { useTheme } from '@astryxdesign/core/theme';
import {
   CartesianGrid,
   Legend,
   Line,
   LineChart,
   ResponsiveContainer,
   Tooltip,
   XAxis,
   YAxis,
} from 'recharts';
import type { DailyPoint } from './types';

function TrendTooltip({
   active,
   label,
   payload,
}: {
   active?: boolean;
   label?: string;
   payload?: { name?: string; value?: number | string }[];
}) {
   if (!active) return null;
   return (
      <VStack padding={3} gap={1} className="bg-surface rounded-lg shadow-md">
         <Text weight="semibold">{label}</Text>
         {payload?.map((row) => (
            <Text key={row.name}>
               {row.name}: {row.value}
            </Text>
         ))}
      </VStack>
   );
}
export function ReportTrend({ rows, onDay }: { rows: DailyPoint[]; onDay: (day: string) => void }) {
   const { token } = useTheme();
   const [table, setTable] = useState(false);
   return (
      <VStack gap={3} width="100%">
         <Heading level={2}>Daily throughput and observed WIP</Heading>
         <Text>
            Created and completed are daily event counts. WIP is the captured Started state at each
            local day end, or the current snapshot for today. Unknown history is shown separately;
            future snapshots remain blank.
         </Text>
         <VStack
            as="figure"
            aria-label="Daily throughput and WIP chart"
            width="100%"
            className="h-80 min-w-0"
         >
            <ResponsiveContainer width="100%" height="100%">
               <LineChart
                  data={rows}
                  accessibilityLayer
                  onClick={(state) => {
                     if (typeof state?.activeLabel === 'string') onDay(state.activeLabel);
                  }}
               >
                  <CartesianGrid stroke={token('--color-border')} />
                  <XAxis
                     dataKey="day"
                     tickFormatter={(value) => String(value).slice(5)}
                     stroke={token('--color-text-primary')}
                  />
                  <YAxis allowDecimals={false} width={40} stroke={token('--color-text-primary')} />
                  <Tooltip content={<TrendTooltip />} />
                  <Legend />
                  <Line
                     dataKey="created"
                     name="Created"
                     stroke={token('--color-data-categorical-blue')}
                     dot={false}
                  />
                  <Line
                     dataKey="completed"
                     name="Completed"
                     stroke={token('--color-data-categorical-green')}
                     dot={false}
                  />
                  <Line
                     dataKey="wip"
                     name="Observed WIP"
                     stroke={token('--color-data-categorical-purple')}
                     dot={false}
                  />
                  <Line
                     dataKey="unknown"
                     name="Unknown history"
                     stroke={token('--color-data-categorical-orange')}
                     dot={false}
                     strokeDasharray="4 4"
                  />
               </LineChart>
            </ResponsiveContainer>
         </VStack>
         <Button
            label={table ? 'Hide daily values' : 'Show daily values'}
            onClick={() => setTable(!table)}
         />
         {table && (
            <List hasDividers>
               {rows.map((row) => (
                  <ListItem
                     key={row.day}
                     label={row.day}
                     description={
                        <Text>{`Created ${row.created} · Completed ${row.completed} · WIP ${row.wip ?? 'not observed'} · Unknown ${row.unknown ?? 'not observed'}${row.complete ? '' : ' · Partial or future day'}`}</Text>
                     }
                     onClick={() => onDay(row.day)}
                  />
               ))}
            </List>
         )}
      </VStack>
   );
}
