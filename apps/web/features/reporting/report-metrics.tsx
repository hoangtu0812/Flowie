import { VStack } from '@astryxdesign/core/Layout';
import { Grid } from '@astryxdesign/core/Grid';
import { Text, Heading } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import type { WorkflowReport } from './types';
const hours = (value: number | null) =>
   value === null ? 'Not enough captured history' : `${(value / 3600).toFixed(1)} hours`;
export function ReportMetrics({ data }: { data: WorkflowReport }) {
   const labels: Record<string, string> = {
      total: 'Accessible tasks',
      open: 'Open now',
      wip: 'Work in progress now',
      completed: 'Completed now',
      canceled: 'Canceled now',
      overdue: 'Overdue now',
      created_in_range: 'Created in selected period',
      estimated_effort: 'Estimated effort, all matching tasks (mandays)',
      actual_effort: 'Recorded actual effort, all matching tasks (mandays)',
   };
   return (
      <VStack gap={4} width="100%">
         <Heading level={2}>Current scope and period activity</Heading>
         <Grid columns={{ minWidth: 240 }} gap={4} width="100%">
            {Object.entries(labels).map(([key, label]) => (
               <VStack key={key} gap={1} role="group" aria-label={label}>
                  <Text color="secondary">{label}</Text>
                  <Text weight="semibold">{data.summary[key]}</Text>
               </VStack>
            ))}
         </Grid>
         <Text>
            Current counts use today&apos;s accessible, non-archived tasks. Period metrics use the
            selected local date range. Effort totals are recorded task values; they are not weekly
            time logs or a capacity forecast.
         </Text>
         <Heading level={2}>Captured delivery time</Heading>
         <List hasDividers>
            <ListItem
               label="Observed completions"
               description={
                  <Text>{`${data.flow.observed_completions} completion events; a reopened task can complete again.`}</Text>
               }
            />
            <ListItem
               label="Lead time"
               description={
                  <Text>{`${hours(data.flow.lead_mean_seconds)} mean · ${hours(data.flow.lead_p50_seconds)} median · ${hours(data.flow.lead_p85_seconds)} P85 · ${data.flow.lead_samples} known episodes`}</Text>
               }
            />
            <ListItem
               label="Cycle time"
               description={
                  <Text>{`${hours(data.flow.cycle_mean_seconds)} mean · ${hours(data.flow.cycle_p50_seconds)} median · ${hours(data.flow.cycle_p85_seconds)} P85 · ${data.flow.cycle_samples} known episodes`}</Text>
               }
            />
            <ListItem
               label="Reopened in period"
               description={
                  <Text>{`${data.reopens.reopened} tasks reopened from Completed; ${data.reopens.bugs_reopened} are currently bugs.`}</Text>
               }
            />
         </List>
         <Text>
            Lead time runs from captured creation or reopening to completion. Cycle time runs from
            the first captured Started entry in that episode to completion, in elapsed hours.
            Missing baseline history and inaccessible historical teams are excluded from duration
            samples.
         </Text>
         <Heading level={2}>Age in current status</Heading>
         <List hasDividers>
            {Object.entries({
               under_7_days: 'Under 7 days',
               days_7_14: '7–14 days',
               days_14_30: '14–30 days',
               days_30_plus: '30 days or more',
               unknown: 'Unknown status-entry time',
            }).map(([key, label]) => (
               <ListItem key={key} label={label} description={String(data.aging[key])} />
            ))}
         </List>
         <Text>
            Open tasks only. A migration baseline records observation time and does not pretend to
            be the time a task entered its status.
         </Text>
      </VStack>
   );
}
