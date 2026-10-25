'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/reporting/messages.vi';

import { Button } from '@astryxdesign/core/Button';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { Grid } from '@astryxdesign/core/Grid';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import {
   reportApi,
   type Workload,
   type ProjectReport,
   type ReportChange,
   type ReportQuery,
} from './types';

export function ReportBreakdowns({
   workspace,
   org,
   body,
}: {
   workspace: string;
   org: string;
   body: string;
}) {
   const tx = useMessages(messages);

   const scope = new URLSearchParams({ workspaceId: workspace }).toString();
   const workload = usePagedResource<Workload>(`${reportApi}/workload?${scope}`, undefined, body);
   const projects = usePagedResource<ProjectReport>(
      `${reportApi}/projects?${scope}`,
      undefined,
      body
   );
   return (
      <Grid columns={{ minWidth: 380, max: 2 }} gap={5} width="100%">
         <VStack gap={3} className="min-w-0">
            <Heading level={2}>{tx('Open workload by planned start week')}</Heading>
            <Collapsible trigger={tx('How workload is calculated')} defaultIsOpen={false}>
               <Text>
                  {tx(
                     "Each task's complete estimate is counted once in its planned start week within the selected range. Unscheduled work has a separate group. This is a planning total, not a per-week allocation or remaining-effort estimate."
                  )}
               </Text>
            </Collapsible>
            <List hasDividers>
               {workload.items.map((row) => (
                  <ListItem
                     key={row.id}
                     label={`${row.assigneeName ?? tx('Unassigned')} · ${row.week ? tx('Week of {week}', { week: row.week }) : tx('Unscheduled')}`}
                     description={
                        <Text>
                           {tx(
                              '{value0} open tasks · {value1} estimated mandays · {value2} missing estimates · {value3} overdue',
                              {
                                 value0: row.count,
                                 value1: row.estimatedEffort,
                                 value2: row.missingEstimates,
                                 value3: row.overdue,
                              }
                           )}
                        </Text>
                     }
                  />
               ))}
            </List>
            {!workload.loading && !workload.error && !workload.items.length && (
               <Text color="secondary">{tx('No workload in this scope.')}</Text>
            )}
            <ResourcePagination
               count={workload.items.length}
               {...workload}
               label={tx('workload groups')}
            />
         </VStack>
         <VStack gap={3} className="min-w-0">
            <Heading level={2}>{tx('Progress and effort by current project')}</Heading>
            <Collapsible trigger={tx('How project totals are calculated')} defaultIsOpen={false}>
               <Text>
                  {tx(
                     'Projects group currently matching tasks. Recorded task effort totals are not attributed to guessed work dates. Completion events cover the selected period, including repeat completions after reopening.'
                  )}
               </Text>
            </Collapsible>
            <List hasDividers>
               {projects.items.map((row) => (
                  <ListItem
                     key={row.id}
                     label={row.name ?? tx('No accessible project')}
                     description={
                        <VStack gap={2}>
                           <Text>
                              {tx(
                                 '{value0} tasks · {value1} open · {value2} created in period · {value3} observed completions · Estimated {value4} / actual {value5} mandays',
                                 {
                                    value0: row.total,
                                    value1: row.open,
                                    value2: row.created,
                                    value3: row.completions,
                                    value4: row.estimatedEffort,
                                    value5: row.actualEffort,
                                 }
                              )}
                           </Text>
                           {row.projectId && (
                              <HStack>
                                 <Button
                                    label={tx('Open project')}
                                    href={`/${org}/project/${row.projectId}/overview`}
                                 />
                              </HStack>
                           )}
                        </VStack>
                     }
                  />
               ))}
            </List>
            {!projects.loading && !projects.error && !projects.items.length && (
               <Text color="secondary">{tx('No projects in this scope.')}</Text>
            )}
            <ResourcePagination
               count={projects.items.length}
               {...projects}
               label={tx('project groups')}
            />
         </VStack>
      </Grid>
   );
}
export function DayChanges({
   workspace,
   org,
   query,
   day,
   onClose,
}: {
   workspace: string;
   org: string;
   query: ReportQuery;
   day: string;
   onClose: () => void;
}) {
   const tx = useMessages(messages);

   const body = JSON.stringify({ ...query, fromDate: day, toDate: day });
   const changes = usePagedResource<ReportChange>(
      `${reportApi}/changes?${new URLSearchParams({ workspaceId: workspace })}`,
      undefined,
      body
   );
   return (
      <VStack gap={3} width="100%">
         <HStack gap={2} wrap="wrap">
            <Heading level={2}>
               {tx('Captured activity:')} {day}
            </Heading>
            <Button label={tx('Close day activity')} onClick={onClose} />
         </HStack>
         <List hasDividers>
            {changes.items.map((row) => (
               <ListItem
                  key={row.id}
                  label={`${row.identifier}: ${row.title}`}
                  description={
                     <VStack gap={2}>
                        <Text>{`${row.kind} · ${new Date(row.occurredAt).toLocaleString(undefined, { timeZone: query.timezone })}`}</Text>
                        <Button
                           label={tx('Open {value0}', { value0: row.identifier })}
                           href={`/${org}/issue/${row.identifier}`}
                        />
                     </VStack>
                  }
               />
            ))}
         </List>
         {!changes.loading && !changes.error && !changes.items.length && (
            <Text>{tx('No captured activity on this day.')}</Text>
         )}
         <ResourcePagination count={changes.items.length} {...changes} label={tx('day events')} />
      </VStack>
   );
}
