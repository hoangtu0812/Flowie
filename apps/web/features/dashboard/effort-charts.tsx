'use client';
import { Grid } from '@astryxdesign/core/Grid';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { useTheme } from '@astryxdesign/core/theme';
import {
   Bar,
   BarChart,
   CartesianGrid,
   Legend,
   Line,
   LineChart,
   ResponsiveContainer,
   Tooltip,
   XAxis,
   YAxis,
} from 'recharts';
import { useMessages } from '@/features/shared/use-messages';
import { useAccountTime } from '@/features/shared/account-time';
import { ChartPanel, ChartTooltip } from './chart-panel';
import { effortSeries } from './effort-series';
import { messages } from './messages.vi';
import type { DashboardReport, ProjectPoint } from './types';

export function EffortCharts({
   data,
   weekStart,
   onProject,
}: {
   data: DashboardReport;
   weekStart: number;
   onProject: (id: string) => void;
}) {
   const tx = useMessages(messages),
      { token } = useTheme(),
      account = useAccountTime();
   const shortDate = new Intl.DateTimeFormat(account.locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
   });
   const colors = [
      token('--color-data-categorical-blue'),
      token('--color-data-categorical-green'),
      token('--color-data-categorical-purple'),
      token('--color-data-categorical-orange'),
   ];
   const projectName = (row: ProjectPoint) => row.name ?? tx('No project or restricted project');
   return (
      <>
         <ChartPanel
            title={tx('Effort trend')}
            description={tx(
               'Estimated by planned start; recorded actual by latest observed completion. These are task values, not time logs.'
            )}
         >
            <VStack as="figure" aria-label={tx('Effort trend')} className="h-72 min-w-0 px-3 pb-4">
               <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                     data={effortSeries(data.effort, weekStart)}
                     accessibilityLayer
                     margin={{ top: 12, right: 16, left: -16, bottom: 0 }}
                  >
                     <CartesianGrid
                        stroke={token('--color-border')}
                        strokeDasharray="3 3"
                        vertical={false}
                     />
                     <XAxis
                        dataKey="day"
                        tickFormatter={(day) =>
                           shortDate.format(new Date(String(day) + 'T00:00:00Z'))
                        }
                        minTickGap={28}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                     />
                     <YAxis tickLine={false} axisLine={false} fontSize={11} />
                     <Tooltip content={<ChartTooltip />} />
                     <Legend
                        iconType="circle"
                        formatter={(value) => <Text type="supporting">{value}</Text>}
                     />
                     <Line
                        isAnimationActive={false}
                        type="monotone"
                        dataKey="estimated"
                        name={tx('Estimated')}
                        stroke={colors[2]}
                        strokeWidth={2}
                        dot={false}
                     />
                     <Line
                        isAnimationActive={false}
                        type="monotone"
                        dataKey="actual"
                        name={tx('Actual')}
                        stroke={colors[3]}
                        strokeWidth={2}
                        dot={false}
                     />
                  </LineChart>
               </ResponsiveContainer>
            </VStack>
            {(data.missingActualDates > 0 || data.missingEstimatedDates > 0) && (
               <VStack padding={4}>
                  <Text color="secondary" className="text-xs">
                     {tx(
                        '{estimated} estimates lack a planned start; {actual} actual values lack a visible completion date. They remain in scope totals but are excluded from the dated trend.',
                        { estimated: data.missingEstimatedDates, actual: data.missingActualDates }
                     )}
                  </Text>
               </VStack>
            )}
         </ChartPanel>
         <Grid gap={5} className="grid-cols-1 xl:grid-cols-2">
            {[
               {
                  title: tx('Throughput by project'),
                  rows: data.projectThroughput,
                  keys: ['created', 'completed'],
                  names: [tx('Created'), tx('Done')],
                  palette: colors.slice(0, 2),
                  description: tx(
                     'Top eight groups in the complete current scope. Select a bar to focus a project.'
                  ),
               },
               {
                  title: tx('Effort by project'),
                  rows: data.projectEffort,
                  keys: ['estimated', 'actual'],
                  names: [tx('Estimated'), tx('Actual')],
                  palette: colors.slice(2),
                  description: tx('Recorded estimated and actual mandays in the current scope.'),
               },
            ].map(({ title, rows, keys, names, palette, description }, index) => (
               <ChartPanel key={title} title={title} description={description}>
                  <VStack as="figure" aria-label={title} className="h-72 min-w-0 px-3 pb-4">
                     {rows.length ? (
                        <ResponsiveContainer width="100%" height="100%">
                           <BarChart
                              data={rows.map((row) => ({ ...row, name: projectName(row) }))}
                              accessibilityLayer
                              layout={index === 0 ? 'vertical' : 'horizontal'}
                              margin={{
                                 top: 0,
                                 right: 16,
                                 left: index === 0 ? 24 : -16,
                                 bottom: 0,
                              }}
                              onClick={(state) => {
                                 const row = state?.activePayload?.[0]?.payload as
                                    ProjectPoint | undefined;
                                 if (row?.project_id) onProject(row.project_id);
                              }}
                           >
                              <CartesianGrid
                                 stroke={token('--color-border')}
                                 strokeDasharray="3 3"
                              />
                              <XAxis
                                 type={index === 0 ? 'number' : 'category'}
                                 dataKey={index === 0 ? undefined : 'name'}
                                 allowDecimals={false}
                                 tickFormatter={
                                    index === 0 ? undefined : (value) => String(value).slice(0, 12)
                                 }
                                 tickLine={false}
                                 axisLine={false}
                                 fontSize={11}
                              />
                              <YAxis
                                 type={index === 0 ? 'category' : 'number'}
                                 dataKey={index === 0 ? 'name' : undefined}
                                 width={index === 0 ? 105 : 40}
                                 tickFormatter={
                                    index === 0 ? (value) => String(value).slice(0, 18) : undefined
                                 }
                                 tickLine={false}
                                 axisLine={false}
                                 fontSize={11}
                              />
                              <Tooltip content={<ChartTooltip />} />
                              <Legend
                                 iconType="circle"
                                 formatter={(value) => <Text type="supporting">{value}</Text>}
                              />
                              {keys.map((key, i) => (
                                 <Bar
                                    isAnimationActive={false}
                                    key={key}
                                    dataKey={key}
                                    name={names[i]}
                                    fill={palette[i]}
                                    radius={index === 0 ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                                 />
                              ))}
                           </BarChart>
                        </ResponsiveContainer>
                     ) : (
                        <Text color="secondary">{tx('No project activity in this scope.')}</Text>
                     )}
                  </VStack>
                  <VStack padding={3} gap={1} className="sr-only focus-within:not-sr-only">
                     {rows
                        .filter((row) => row.project_id)
                        .map((row) => (
                           <Button
                              key={row.id}
                              label={projectName(row)}
                              size="sm"
                              variant="ghost"
                              onClick={() => onProject(row.project_id!)}
                           />
                        ))}
                  </VStack>
               </ChartPanel>
            ))}
         </Grid>
      </>
   );
}
