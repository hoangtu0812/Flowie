'use client';
import { useState } from 'react';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { useTheme } from '@astryxdesign/core/theme';
import {
   CartesianGrid,
   Cell,
   Legend,
   Line,
   LineChart,
   Pie,
   PieChart,
   ResponsiveContainer,
   Tooltip,
   XAxis,
   YAxis,
} from 'recharts';
import { useMessages } from '@/features/shared/use-messages';
import { useAccountTime } from '@/features/shared/account-time';
import { messages } from './messages.vi';
import { ChartPanel, ChartTooltip } from './chart-panel';
import type { DashboardReport } from './types';

export function ThroughputCharts({
   data,
   onDay,
   onStatus,
}: {
   data: DashboardReport;
   onDay: (day: string) => void;
   onStatus: (id: string, name: string) => void;
}) {
   const tx = useMessages(messages),
      { token } = useTheme(),
      account = useAccountTime();
   const shortDate = new Intl.DateTimeFormat(account.locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
   });
   const [day, setDay] = useState('');
   const statuses = data.statuses.filter(
      (row) => !['COMPLETED', 'CANCELED'].includes(row.category)
   );
   const blue = token('--color-data-categorical-blue'),
      green = token('--color-data-categorical-green');
   return (
      <Grid gap={5} className="grid-cols-1 xl:grid-cols-3">
         <ChartPanel
            className="xl:col-span-2"
            title={tx('Issue throughput')}
            description={tx(
               'Created and completed issues per day. Select a day to inspect its activity.'
            )}
         >
            <VStack as="figure" aria-label={tx('Issue throughput')} className="h-72 min-w-0 px-3">
               <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                     data={data.trend}
                     accessibilityLayer
                     margin={{ top: 12, right: 16, left: -16, bottom: 0 }}
                     onClick={(state) => {
                        if (typeof state?.activeLabel === 'string') onDay(state.activeLabel);
                     }}
                  >
                     <CartesianGrid
                        stroke={token('--color-border')}
                        strokeDasharray="3 3"
                        vertical={false}
                     />
                     <XAxis
                        dataKey="day"
                        tickFormatter={(value) =>
                           shortDate.format(new Date(String(value) + 'T00:00:00Z'))
                        }
                        minTickGap={28}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                     />
                     <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                     <Tooltip content={<ChartTooltip />} />
                     <Legend
                        iconType="circle"
                        formatter={(value) => <Text type="supporting">{value}</Text>}
                     />
                     <Line
                        isAnimationActive={false}
                        type="monotone"
                        dataKey="created"
                        name={tx('Created')}
                        stroke={blue}
                        strokeWidth={2}
                        dot={false}
                     />
                     <Line
                        isAnimationActive={false}
                        type="monotone"
                        dataKey="completed"
                        name={tx('Done')}
                        stroke={green}
                        strokeWidth={2}
                        dot={false}
                     />
                  </LineChart>
               </ResponsiveContainer>
            </VStack>
            <HStack padding={3} gap={2} wrap="wrap">
               <Selector
                  label={tx('Activity day')}
                  isLabelHidden
                  value={day || data.trend.at(-1)?.day || ''}
                  options={data.trend.map((row) => ({ value: row.day, label: row.day }))}
                  onChange={setDay}
                  size="sm"
               />
               <Button
                  label={tx('Show daily activity')}
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                     const selected = day || data.trend.at(-1)?.day;
                     if (selected) onDay(selected);
                  }}
               />
            </HStack>
         </ChartPanel>
         <ChartPanel
            title={tx('Open work by status')}
            description={tx('Click a slice to focus the dashboard.')}
         >
            <VStack
               as="figure"
               aria-label={tx('Open work by status')}
               className="h-72 min-w-0 px-2"
            >
               {statuses.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                     <PieChart>
                        <Pie
                           isAnimationActive={false}
                           data={statuses}
                           dataKey="count"
                           nameKey="name"
                           innerRadius={58}
                           outerRadius={90}
                           paddingAngle={3}
                           onClick={(row) => onStatus(row.id, row.name)}
                        >
                           {statuses.map((row) => (
                              <Cell key={row.id} fill={row.color || blue} />
                           ))}
                        </Pie>
                        <Tooltip content={<ChartTooltip />} />
                        <Legend
                           iconType="circle"
                           content={
                              <HStack gap={1} wrap="wrap" justify="center" align="center">
                                 {statuses.map((row) => (
                                    <HStack key={row.id} gap={1} align="center">
                                       <svg width={8} height={8} aria-hidden="true">
                                          <circle cx={4} cy={4} r={4} fill={row.color || blue} />
                                       </svg>
                                       <Button
                                          size="sm"
                                          variant="ghost"
                                          label={`${row.name} (${row.count})`}
                                          onClick={() => onStatus(row.id, row.name)}
                                       />
                                    </HStack>
                                 ))}
                              </HStack>
                           }
                        />
                     </PieChart>
                  </ResponsiveContainer>
               ) : (
                  <Text color="secondary">{tx('No open issues in this scope.')}</Text>
               )}
            </VStack>
         </ChartPanel>
      </Grid>
   );
}
