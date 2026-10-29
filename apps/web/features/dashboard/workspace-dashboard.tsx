'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { useWorkspaceTeams } from '@/features/shared/use-workspace-teams';
import { useAccountTime } from '@/features/shared/account-time';
import { useMessages } from '@/features/shared/use-messages';
import { reportWeekStart } from '@/features/shared/date-format';
import { recentQuery, type ReportQuery } from '@/features/reporting/types';
import { useWorkflowReport } from '@/features/reporting/use-workflow-report';
import { DayChanges } from '@/features/reporting/report-breakdowns';
import { DashboardToolbar } from './dashboard-toolbar';
import { MetricCards } from './metric-cards';
import { ThroughputCharts } from './throughput-charts';
import { EffortCharts } from './effort-charts';
import { MemberChart } from './member-chart';
import { messages } from './messages.vi';
import type { DashboardReport } from './types';

export function WorkspaceDashboard() {
   const { orgId } = useParams<{ orgId: string }>();
   const scope = useWorkspaceTeams(orgId),
      account = useAccountTime(),
      tx = useMessages(messages);
   if (scope.error)
      return (
         <RecoveryScreen
            title={tx('Dashboard unavailable')}
            message={scope.error}
            retry={scope.reload}
         />
      );
   return (
      <DesignSurface>
         {scope.workspace ? (
            <Dashboard
               key={`${scope.workspace}:${account.timezone}:${account.weekStart}`}
               org={orgId}
               workspace={scope.workspace}
            />
         ) : (
            <VStack padding={6}>
               <Text role="status">{tx('Loading dashboard…')}</Text>
            </VStack>
         )}
      </DesignSurface>
   );
}

function Dashboard({ org, workspace }: { org: string; workspace: string }) {
   const tx = useMessages(messages),
      account = useAccountTime();
   const [query, setQuery] = useState<ReportQuery>(() => ({
      ...recentQuery(30, account.timezone),
      weekStart: reportWeekStart(account.weekStart),
   }));
   const [day, setDay] = useState<string>(),
      [statusName, setStatusName] = useState('');
   const report = useWorkflowReport<DashboardReport>(workspace, JSON.stringify(query), 'dashboard');
   const apply = (next: ReportQuery) => {
      setDay(undefined);
      setQuery(next);
      if (!next.selection.filters?.length) setStatusName('');
   };
   return (
      <VStack gap={5} width="100%" maxWidth={1600} className="mx-auto p-4 md:p-6">
         <DashboardToolbar
            workspace={workspace}
            value={query}
            onApply={apply}
            heading={
               <VStack gap={1} maxWidth="24rem">
                  <Heading level={2} accessibilityLevel={1}>
                     {tx('Workspace dashboard')}
                  </Heading>
                  <Text type="supporting">
                     {tx('Issue delivery, throughput, workload and risk across the workspace.')}
                  </Text>
               </VStack>
            }
            actions={
               <HStack gap={2} wrap="wrap" align="center">
                  <Button
                     label={tx('Refresh dashboard')}
                     variant="ghost"
                     size="sm"
                     onClick={report.reload}
                     isDisabled={report.loading}
                  />
                  <Button
                     label={tx('Advanced reports')}
                     variant="secondary"
                     size="sm"
                     href={`/${org}/reports`}
                  />
               </HStack>
            }
         />
         {statusName && (
            <HStack gap={2} wrap="wrap">
               <Text type="supporting">
                  {tx('Focused status: {status}', { status: statusName })}
               </Text>
               <Button
                  size="sm"
                  variant="ghost"
                  label={tx('Clear focus')}
                  onClick={() =>
                     apply({ ...query, selection: { ...query.selection, filters: [] } })
                  }
               />
            </HStack>
         )}
         {report.loading && (
            <Text type="supporting" role="status">
               {tx('Loading dashboard…')}
            </Text>
         )}
         {report.error && <Text role="alert">{report.error}</Text>}
         {report.data && (
            <>
               <MetricCards data={report.data} />
               <ThroughputCharts
                  data={report.data}
                  onDay={setDay}
                  onStatus={(id, name) => {
                     setStatusName(name);
                     apply({
                        ...query,
                        selection: {
                           ...query.selection,
                           filters: [
                              { columnId: 'status', type: 'option', operator: 'is', values: [id] },
                           ],
                        },
                     });
                  }}
               />
               {day && (
                  <DayChanges
                     key={`${day}:${JSON.stringify(query.selection)}`}
                     workspace={workspace}
                     org={org}
                     query={query}
                     day={day}
                     onClose={() => setDay(undefined)}
                  />
               )}
               <EffortCharts
                  data={report.data}
                  weekStart={query.weekStart}
                  onProject={(projectId) =>
                     apply({ ...query, selection: { ...query.selection, projectId } })
                  }
               />
               <MemberChart data={report.data} />
               <Text type="supporting">
                  {tx(
                     'Completion history starts when events were captured; repeated completions after reopening are counted. Current counts are not historical snapshots.'
                  )}
               </Text>
            </>
         )}
      </VStack>
   );
}
