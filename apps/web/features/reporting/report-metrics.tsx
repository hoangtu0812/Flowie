'use client';

import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/reporting/messages.vi';
import { VStack } from '@astryxdesign/core/Layout';
import { Grid } from '@astryxdesign/core/Grid';
import { Text, Heading } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { Card } from '@astryxdesign/core/Card';
import { Section } from '@astryxdesign/core/Section';
import type { WorkflowReport } from './types';
export function ReportMetrics({ data }: { data: WorkflowReport }) {
   const tx = useMessages(messages);
   const hours = (value: number | null) =>
      value === null
         ? tx('Not enough captured history')
         : tx('{hours} hours', { hours: (value / 3600).toFixed(1) });

   const labels: Record<string, string> = {
      total: tx('Accessible tasks'),
      open: tx('Open now'),
      wip: tx('Work in progress now'),
      completed: tx('Completed now'),
      canceled: tx('Canceled now'),
      overdue: tx('Overdue now'),
      created_in_range: tx('Created in selected period'),
      estimated_effort: tx('Estimated effort, all matching tasks (mandays)'),
      actual_effort: tx('Recorded actual effort, all matching tasks (mandays)'),
   };
   return (
      <VStack gap={4} width="100%">
         <Heading level={2}>{tx('Current scope and period activity')}</Heading>
         <Grid columns={{ minWidth: 180, max: 6 }} gap={3} width="100%">
            {['total', 'open', 'wip', 'completed', 'overdue', 'created_in_range'].map((key) => (
               <Card key={key} padding={4}>
                  <VStack gap={2} role="group" aria-label={labels[key]}>
                     <Text color="secondary">{labels[key]}</Text>
                     <Text size="3xl" weight="semibold" hasTabularNumbers>
                        {data.summary[key]}
                     </Text>
                  </VStack>
               </Card>
            ))}
         </Grid>
         <Section padding={3} variant="muted" className="rounded-lg">
            <Grid columns={{ minWidth: 220, max: 3 }} gap={3}>
               {['canceled', 'estimated_effort', 'actual_effort'].map((key) => (
                  <VStack key={key} gap={1} role="group" aria-label={labels[key]}>
                     <Text color="secondary">{labels[key]}</Text>
                     <Text weight="semibold" hasTabularNumbers>
                        {data.summary[key]}
                     </Text>
                  </VStack>
               ))}
            </Grid>
         </Section>
         <Text type="supporting">
            {tx(
               "Current counts use today's accessible, non-archived tasks. Period metrics use the selected local date range. Effort totals are recorded task values; they are not weekly time logs or a capacity forecast."
            )}
         </Text>
         <Grid columns={{ minWidth: 380, max: 2 }} gap={5} width="100%">
            <VStack gap={3} className="min-w-0">
               <Heading level={2}>{tx('Captured delivery time')}</Heading>
               <List hasDividers>
                  <ListItem
                     label={tx('Observed completions')}
                     description={
                        <Text>
                           {tx('{value0} completion events; a reopened task can complete again.', {
                              value0: data.flow.observed_completions ?? '—',
                           })}
                        </Text>
                     }
                  />
                  <ListItem
                     label={tx('Lead time')}
                     description={
                        <Text>
                           {data.flow.lead_samples
                              ? tx(
                                   '{value0} mean · {value1} median · {value2} P85 · {value3} known episodes',
                                   {
                                      value0: hours(data.flow.lead_mean_seconds),
                                      value1: hours(data.flow.lead_p50_seconds),
                                      value2: hours(data.flow.lead_p85_seconds),
                                      value3: data.flow.lead_samples ?? '—',
                                   }
                                )
                              : tx('Not enough captured history')}
                        </Text>
                     }
                  />
                  <ListItem
                     label={tx('Cycle time')}
                     description={
                        <Text>
                           {data.flow.cycle_samples
                              ? tx(
                                   '{value0} mean · {value1} median · {value2} P85 · {value3} known episodes',
                                   {
                                      value0: hours(data.flow.cycle_mean_seconds),
                                      value1: hours(data.flow.cycle_p50_seconds),
                                      value2: hours(data.flow.cycle_p85_seconds),
                                      value3: data.flow.cycle_samples ?? '—',
                                   }
                                )
                              : tx('Not enough captured history')}
                        </Text>
                     }
                  />
                  <ListItem
                     label={tx('Reopened in period')}
                     description={
                        <Text>
                           {tx(
                              '{value0} tasks reopened from Completed; {value1} are currently bugs.',
                              {
                                 value0: data.reopens.reopened,
                                 value1: data.reopens.bugs_reopened,
                              }
                           )}
                        </Text>
                     }
                  />
               </List>
               <Text type="supporting">
                  {tx(
                     'Lead time runs from captured creation or reopening to completion. Cycle time runs from the first captured Started entry in that episode to completion, in elapsed hours. Missing baseline history and inaccessible historical teams are excluded from duration samples.'
                  )}
               </Text>
            </VStack>
            <VStack gap={3} className="min-w-0">
               <Heading level={2}>{tx('Age in current status')}</Heading>
               <List hasDividers>
                  {Object.entries({
                     under_7_days: tx('Under 7 days'),
                     days_7_14: tx('7–14 days'),
                     days_14_30: tx('14–30 days'),
                     days_30_plus: tx('30 days or more'),
                     unknown: tx('Unknown status-entry time'),
                  }).map(([key, label]) => (
                     <ListItem
                        key={key}
                        label={label}
                        endContent={
                           <Text hasTabularNumbers weight="semibold">
                              {data.aging[key]}
                           </Text>
                        }
                     />
                  ))}
               </List>
               <Text type="supporting">
                  {tx(
                     'Open tasks only. A migration baseline records observation time and does not pretend to be the time a task entered its status.'
                  )}
               </Text>
            </VStack>
         </Grid>
      </VStack>
   );
}
