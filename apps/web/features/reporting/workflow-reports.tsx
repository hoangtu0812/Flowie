'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/reporting/messages.vi';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Card } from '@astryxdesign/core/Card';
import { Section } from '@astryxdesign/core/Section';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { DesignSurface } from '@/components/common/design-surface';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { useWorkspaceTeams } from '@/features/shared/use-workspace-teams';
import { useWorkflowReport } from './use-workflow-report';
import { ReportFilters } from './report-filters';
import { ReportMetrics } from './report-metrics';
import { ReportTrend } from './report-trend';
import { DayChanges, ReportBreakdowns } from './report-breakdowns';
import { recentQuery, type ReportQuery } from './types';
import { useAccountTime } from '@/features/shared/account-time';
import { reportWeekStart } from '@/features/shared/date-format';
import { messages as dashboardMessages } from '@/features/dashboard/messages.vi';

export function WorkflowReports() {
   const tx = useMessages(messages);

   const accountTime = useAccountTime();
   const { orgId } = useParams<{ orgId: string }>();
   const scope = useWorkspaceTeams(orgId);
   if (scope.error)
      return (
         <RecoveryScreen
            title={tx('Workspace analytics unavailable')}
            message={scope.error}
            retry={scope.reload}
         />
      );
   if (!scope.workspace)
      return (
         <DesignSurface>
            <VStack padding={6}>
               <Text>{tx('Loading workspace analytics…')}</Text>
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
   const tx = useMessages(messages);
   const dashboardText = useMessages(dashboardMessages);

   const accountTime = useAccountTime();
   const [query, setQuery] = useState<ReportQuery>(() => ({
         ...recentQuery(30, accountTime.timezone),
         weekStart: reportWeekStart(accountTime.weekStart),
      })),
      [day, setDay] = useState<string>();
   const body = JSON.stringify(query);
   const report = useWorkflowReport(workspace, body);
   return (
      <VStack width="100%" height="100%" isScrollable>
         <VStack gap={6} padding={6} width="100%" maxWidth={1440} className="mx-auto min-w-0">
            <HStack hAlign="between" vAlign="center" gap={3} wrap="wrap">
               <HStack vAlign="center" gap={2}>
                  <SidebarTrigger className="md:hidden" />
                  <Button
                     label={dashboardText('Back to dashboard')}
                     variant="ghost"
                     icon={<ArrowLeft />}
                     as={Link}
                     href={`/${org}/dashboard`}
                  />
               </HStack>
               <Button
                  label={tx('Refresh workspace analytics')}
                  icon={<RefreshCw />}
                  onClick={report.reload}
                  isDisabled={report.loading}
               />
            </HStack>
            <VStack gap={2}>
               <Heading level={1}>{tx('Workspace analytics')}</Heading>
               <Text color="secondary">
                  {tx('Understand delivery, spot delays, and plan your team’s workload.')}
               </Text>
            </VStack>
            <Section variant="muted" padding={4} className="rounded-lg">
               <ReportFilters
                  workspace={workspace}
                  teams={teams}
                  value={query}
                  onApply={(value) => {
                     setDay(undefined);
                     setQuery(value);
                  }}
               />
            </Section>
            {report.error && <Text role="alert">{report.error}</Text>}
            {report.loading && <Text role="status">{tx('Calculating workspace analytics…')}</Text>}
            {report.data && (
               <>
                  <Text type="supporting">
                     {tx('Snapshot {value0} · {value1} · {value2} to {value3}', {
                        value0: new Date(report.data.asOf).toLocaleString(accountTime.locale, {
                           timeZone: query.timezone,
                        }),
                        value1: query.timezone,
                        value2: query.fromDate,
                        value3: query.toDate,
                     })}
                  </Text>
                  <ReportMetrics data={report.data} />
                  <Grid columns={{ minWidth: 380, max: 2 }} gap={5} width="100%">
                     <Card padding={4} className="min-w-0">
                        <ReportTrend rows={report.data.trend} onDay={setDay} />
                     </Card>
                     <Card padding={4}>
                        <VStack gap={3}>
                           <Heading level={2}>{tx('Current status distribution')}</Heading>
                           <Text color="secondary">
                              {tx('All matching tasks, grouped by their current status.')}
                           </Text>
                           <List hasDividers>
                              {report.data.statuses.map((row) => (
                                 <ListItem
                                    key={row.id}
                                    label={row.name}
                                    endContent={
                                       <Text hasTabularNumbers weight="semibold">
                                          {row.count}
                                       </Text>
                                    }
                                 />
                              ))}
                           </List>
                           {!report.data.statuses.length && (
                              <Text color="secondary">
                                 {tx('No matching tasks. Try a broader scope.')}
                              </Text>
                           )}
                        </VStack>
                     </Card>
                  </Grid>
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
                  <ReportBreakdowns workspace={workspace} org={org} body={body} />
               </>
            )}
         </VStack>
      </VStack>
   );
}
