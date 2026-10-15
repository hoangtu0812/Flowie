'use client';
import { Button } from '@astryxdesign/core/Button';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
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
   const scope = new URLSearchParams({ workspaceId: workspace }).toString();
   const workload = usePagedResource<Workload>(`${reportApi}/workload?${scope}`, undefined, body);
   const projects = usePagedResource<ProjectReport>(
      `${reportApi}/projects?${scope}`,
      undefined,
      body
   );
   return (
      <VStack gap={5} width="100%">
         <Heading level={2}>Open workload by planned start week</Heading>
         <Text>
            Each task&apos;s complete estimate is counted once in its planned start week within the
            selected range. Unscheduled work has a separate group. This is a planning total, not a
            per-week allocation or remaining-effort estimate.
         </Text>
         <List hasDividers>
            {workload.items.map((row) => (
               <ListItem
                  key={row.id}
                  label={`${row.assigneeName ?? 'Unassigned'} · ${row.week ? 'Week of ' + row.week : 'Unscheduled'}`}
                  description={
                     <Text>{`${row.count} open tasks · ${row.estimatedEffort} estimated mandays · ${row.missingEstimates} missing estimates · ${row.overdue} overdue`}</Text>
                  }
               />
            ))}
         </List>
         <ResourcePagination count={workload.items.length} {...workload} label="workload groups" />
         <Heading level={2}>Progress and effort by current project</Heading>
         <Text>
            Projects group currently matching tasks. Recorded task effort totals are not attributed
            to guessed work dates. Completion events cover the selected period, including repeat
            completions after reopening.
         </Text>
         <List hasDividers>
            {projects.items.map((row) => (
               <ListItem
                  key={row.id}
                  label={row.name ?? 'No accessible project'}
                  description={
                     <VStack gap={2}>
                        <Text>{`${row.total} tasks · ${row.open} open · ${row.created} created in period · ${row.completions} observed completions · Estimated ${row.estimatedEffort} / actual ${row.actualEffort} mandays`}</Text>
                        {row.projectId && (
                           <Button
                              label="Open project"
                              href={`/${org}/project/${row.projectId}/overview`}
                           />
                        )}
                     </VStack>
                  }
               />
            ))}
         </List>
         <ResourcePagination count={projects.items.length} {...projects} label="project groups" />
      </VStack>
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
   const body = JSON.stringify({ ...query, fromDate: day, toDate: day });
   const changes = usePagedResource<ReportChange>(
      `${reportApi}/changes?${new URLSearchParams({ workspaceId: workspace })}`,
      undefined,
      body
   );
   return (
      <VStack gap={3} width="100%">
         <HStack gap={2} wrap="wrap">
            <Heading level={2}>Captured activity: {day}</Heading>
            <Button label="Close day activity" onClick={onClose} />
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
                           label={`Open ${row.identifier}`}
                           href={`/${org}/issue/${row.identifier}`}
                        />
                     </VStack>
                  }
               />
            ))}
         </List>
         {!changes.loading && !changes.error && !changes.items.length && (
            <Text>No captured activity on this day.</Text>
         )}
         <ResourcePagination count={changes.items.length} {...changes} label="day events" />
      </VStack>
   );
}
