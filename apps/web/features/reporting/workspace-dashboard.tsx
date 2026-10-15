'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { DesignSurface } from '@/components/common/design-surface';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { useWorkspaceTeams } from '@/features/shared/use-workspace-teams';
import { useWorkflowReport } from './use-workflow-report';
import { ReportFilters } from './report-filters';
import { ReportMetrics } from './report-metrics';
import { ReportTrend } from './report-trend';
import { DayChanges, ReportBreakdowns } from './report-breakdowns';
import { recentQuery, type ReportQuery } from './types';
import { useAccountTime } from '@/features/shared/account-time';

export function WorkspaceDashboard() {
   const accountTime = useAccountTime();
   const { orgId } = useParams<{ orgId: string }>();
   const scope = useWorkspaceTeams(orgId);
   if (scope.error)
      return (
         <RecoveryScreen
            title="Workspace analytics unavailable"
            message={scope.error}
            retry={scope.reload}
         />
      );
   if (!scope.workspace)
      return (
         <DesignSurface>
            <VStack padding={6}>
               <Text>Loading workspace analytics…</Text>
            </VStack>
         </DesignSurface>
      );
   return (
      <DesignSurface>
         <Dashboard
            key={`${scope.workspace}:${accountTime.timezone}:${accountTime.weekStart}`}
            workspace={scope.workspace}
            org={orgId}
            teams={scope.teams ?? []}
         />
      </DesignSurface>
   );
}
function Dashboard({
   workspace,
   org,
   teams,
}: {
   workspace: string;
   org: string;
   teams: { id: string; name: string }[];
}) {
   const accountTime = useAccountTime();
   const [query, setQuery] = useState<ReportQuery>(() => ({
         ...recentQuery(30, accountTime.timezone),
         weekStart: accountTime.weekStart,
      })),
      [day, setDay] = useState<string>();
   const body = JSON.stringify(query);
   const report = useWorkflowReport(workspace, body);
   return (
      <VStack gap={6} padding={6} width="100%" className="h-full overflow-auto">
         <Heading level={1}>Workspace analytics</Heading>
         <Text>
            Server-calculated reports cover all current matches. Historical values use captured
            lifecycle events; missing history is shown explicitly.
         </Text>
         <ReportFilters
            workspace={workspace}
            teams={teams}
            value={query}
            onApply={(value) => {
               setDay(undefined);
               setQuery(value);
            }}
         />
         <Button
            label="Refresh workspace analytics"
            onClick={report.reload}
            isDisabled={report.loading}
         />
         {report.error && <Text role="alert">{report.error}</Text>}
         {report.loading && <Text role="status">Calculating workspace analytics…</Text>}
         {report.data && (
            <>
               <Text>{`Snapshot ${new Date(report.data.asOf).toLocaleString(undefined, { timeZone: query.timezone })} · ${query.timezone} · ${query.fromDate} to ${query.toDate}`}</Text>
               <ReportMetrics data={report.data} />
               <ReportTrend rows={report.data.trend} onDay={setDay} />
               {day && (
                  <DayChanges
                     key={day}
                     workspace={workspace}
                     org={org}
                     query={query}
                     day={day}
                     onClose={() => setDay(undefined)}
                  />
               )}
               <Heading level={2}>Current status distribution</Heading>
               <List hasDividers>
                  {report.data.statuses.map((row) => (
                     <ListItem key={row.id} label={row.name} description={String(row.count)} />
                  ))}
               </List>
               <ReportBreakdowns workspace={workspace} org={org} body={body} />
            </>
         )}
      </VStack>
   );
}
