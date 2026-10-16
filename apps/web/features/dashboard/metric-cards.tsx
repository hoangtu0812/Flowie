'use client';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { AlertTriangle, CheckCircle2, CircleDot, ClipboardList, Timer } from 'lucide-react';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';
import { useTheme } from '@astryxdesign/core/theme';
import type { DashboardReport } from './types';

export function MetricCards({ data }: { data: DashboardReport }) {
   const tx = useMessages(messages);
   const { token } = useTheme();
   const created = data.summary.created_in_range,
      done = data.flow.observed_completions ?? 0;
   const items = [
      {
         label: tx('Created'),
         value: created,
         hint: tx('New issues in this period'),
         icon: ClipboardList,
      },
      {
         label: tx('Done'),
         value: done,
         hint: tx('Observed completions in this period'),
         icon: CheckCircle2,
      },
      {
         label: tx('Completion rate'),
         value: created ? `${Math.round((done / created) * 100)}%` : '—',
         hint: tx('Done divided by created'),
         icon: CircleDot,
      },
      {
         label: tx('Open now'),
         value: data.summary.open,
         hint: tx('Current open issues in this scope'),
         icon: Timer,
      },
      {
         label: tx('Overdue'),
         value: data.summary.overdue,
         hint: tx('Open issues past their due date now'),
         icon: AlertTriangle,
      },
   ];
   return (
      <Grid
         gap={3}
         className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-5"
         aria-label={tx('Workspace dashboard')}
      >
         {items.map(({ label, value, hint, icon: Icon }, index) => (
            <Card key={label} padding={4} elevation="none" role="group" aria-label={label}>
               <HStack justify="between" align="start" gap={3}>
                  <VStack gap={1}>
                     <Text type="supporting">{label}</Text>
                     <Text weight="semibold" size="2xl" hasTabularNumbers>
                        {value}
                     </Text>
                  </VStack>
                  <VStack padding={2} className="rounded-lg bg-primary/10 text-primary">
                     <Icon
                        className="size-4"
                        stroke={token(
                           index === 1
                              ? '--color-data-categorical-green'
                              : index === 4
                                ? '--color-data-categorical-orange'
                                : '--color-data-categorical-blue'
                        )}
                     />
                  </VStack>
               </HStack>
               <Text type="supporting" className="mt-2">
                  {hint}
               </Text>
            </Card>
         ))}
      </Grid>
   );
}
