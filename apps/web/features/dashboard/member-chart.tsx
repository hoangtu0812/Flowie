'use client';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { useTheme } from '@astryxdesign/core/theme';
import {
   Bar,
   BarChart,
   CartesianGrid,
   Legend,
   ResponsiveContainer,
   Tooltip,
   XAxis,
   YAxis,
} from 'recharts';
import { useMessages } from '@/features/shared/use-messages';
import { ChartPanel } from './chart-panel';
import { messages } from './messages.vi';
import type { DashboardReport, MemberPoint } from './types';

// Current status split per assignee for the filtered scope; the API already limits rows to readable issues and the top ten groups.
// VI: Phân bổ trạng thái hiện tại theo người được giao trong phạm vi lọc; API đã giới hạn issue đọc được và mười nhóm lớn nhất.
export function MemberChart({ data }: { data: DashboardReport }) {
   const tx = useMessages(messages),
      { token } = useTheme();
   const rows = data.memberGroups.map((row) => ({ ...row, name: row.name ?? tx('Unassigned') }));
   const series = [
      { key: 'todo', name: tx('To do'), color: token('--color-data-categorical-blue') },
      { key: 'started', name: tx('In progress'), color: token('--color-data-categorical-orange') },
      { key: 'done', name: tx('Done'), color: token('--color-data-categorical-green') },
   ];
   return (
      <ChartPanel
         title={tx('Issues by member')}
         description={
            data.memberCount > rows.length
               ? tx('Current status of issues per assignee. Top {shown} of {total} members.', {
                    shown: rows.length,
                    total: data.memberCount,
                 })
               : tx('Current status of issues per assignee in this scope.')
         }
      >
         <VStack as="figure" aria-label={tx('Issues by member')} className="h-80 min-w-0 px-3 pb-4">
            {rows.length ? (
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                     data={rows}
                     layout="vertical"
                     accessibilityLayer
                     margin={{ top: 0, right: 16, left: 24, bottom: 0 }}
                  >
                     <CartesianGrid stroke={token('--color-border')} strokeDasharray="3 3" />
                     <XAxis
                        type="number"
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                     />
                     <YAxis
                        type="category"
                        dataKey="name"
                        width={120}
                        tickFormatter={(value) => String(value).slice(0, 20)}
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                     />
                     <Tooltip content={<MemberTooltip />} />
                     <Legend
                        iconType="circle"
                        formatter={(value) => <Text type="supporting">{value}</Text>}
                     />
                     {series.map(({ key, name, color }) => (
                        <Bar
                           isAnimationActive={false}
                           key={key}
                           dataKey={key}
                           name={name}
                           stackId="member"
                           fill={color}
                        />
                     ))}
                  </BarChart>
               </ResponsiveContainer>
            ) : (
               <Text color="secondary">{tx('No assigned work in this scope.')}</Text>
            )}
         </VStack>
      </ChartPanel>
   );
}

function MemberTooltip({
   active,
   label,
   payload,
}: {
   active?: boolean;
   label?: string | number;
   payload?: readonly { name?: string | number; value?: string | number; payload?: MemberPoint }[];
}) {
   const tx = useMessages(messages);
   const row = payload?.[0]?.payload;
   if (!active || !row) return null;
   return (
      <VStack padding={3} gap={1} className="bg-surface rounded-lg shadow-md">
         <Text weight="semibold">{label}</Text>
         {payload.map((item, index) => (
            <Text key={index}>
               {item.name}: {item.value}
            </Text>
         ))}
         <Text type="supporting">
            {tx('Effort: {estimated} estimated · {actual} actual', {
               estimated: row.estimated,
               actual: row.actual,
            })}
         </Text>
      </VStack>
   );
}
