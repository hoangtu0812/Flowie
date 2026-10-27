'use client';
import { useDateFormatter } from '@/features/shared/account-time';
import { useEnumLabel } from '@/features/shared/enum-labels';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/sla/messages.vi';

import { useEffect, useRef, useState } from 'react';
import { History, ListRestart, RefreshCw, RotateCw } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { Token } from '@astryxdesign/core/Token';
import type { Issue } from '@/mock-data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseEnvelope } from '@/lib/http';
import { slaApi, type IssueSla, type VersionPage } from './types';

export function IssueSlaPanel({ issue }: { issue: Issue }) {
   const workspace = useIssuesStore((state) => state.workspaceId);
   return workspace ? (
      <ClockPanel key={workspace + issue.id} workspace={workspace} issue={issue} />
   ) : null;
}
function ClockPanel({ workspace, issue }: { workspace: string; issue: Issue }) {
   const tx = useMessages(messages);
   const enumLabel = useEnumLabel();
   const dateLabel = useDateFormatter();

   const [data, setData] = useState<IssueSla>(),
      [page, setPage] = useState<VersionPage>();
   const [busy, setBusy] = useState(false),
      [error, setError] = useState(''),
      [refresh, setRefresh] = useState(0);
   const [history, setHistory] = useState(false),
      [confirm, setConfirm] = useState(false);
   const alive = useRef(true),
      inflight = useRef(false),
      generation = useRef(0);
   const base = `${slaApi}/issues/${issue.id}`;
   const scope = new URLSearchParams({ workspaceId: workspace }).toString();
   const load = async (before?: number) => {
      if (inflight.current) return;
      inflight.current = true;
      setBusy(true);
      setError('');
      const request = generation.current;
      try {
         const result = await responseEnvelope<IssueSla, VersionPage>(
            await authenticatedFetch(`${base}/clock?${scope}${before ? '&before=' + before : ''}`)
         );
         if (alive.current && request === generation.current) {
            setData((previous) => ({
               ...result.data,
               history:
                  before && previous
                     ? [...previous.history, ...result.data.history]
                     : result.data.history,
            }));
            setPage(result.meta);
         }
      } catch (reason) {
         if (alive.current && request === generation.current) setError(String(reason));
      } finally {
         if (alive.current && request === generation.current) {
            inflight.current = false;
            setBusy(false);
         }
      }
   };
   useEffect(() => {
      alive.current = true;
      generation.current++;
      inflight.current = false;
      setConfirm(false);
      void load();
      return () => {
         alive.current = false;
         generation.current++;
      };
   }, [workspace, issue.id, issue.version, refresh]);
   useEffect(() => {
      if (history) return;
      const timer = setInterval(() => {
         if (document.visibilityState === 'visible') void load();
      }, 30000);
      return () => clearInterval(timer);
   }, [history, workspace, issue.id, issue.version]);
   const command = async (name: 'apply' | 'retry') => {
      if (inflight.current || !data) return;
      inflight.current = true;
      setBusy(true);
      setError('');
      try {
         const result = await responseEnvelope<IssueSla, VersionPage>(
            await authenticatedFetch(`${base}/${name}?${scope}`, {
               method: 'POST',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify(
                  name === 'apply'
                     ? { expectedVersion: data.issueVersion, expectedCycle: data.latestCycle }
                     : { expectedGeneration: data.job?.generation }
               ),
            })
         );
         if (!alive.current) return;
         setData(result.data);
         setPage(result.meta);
         setConfirm(false);
         await useIssuesStore.getState().loadIssue(issue.identifier);
      } catch (reason) {
         if (alive.current) setError(String(reason));
      } finally {
         if (alive.current) {
            inflight.current = false;
            setBusy(false);
         }
      }
   };
   const current = data?.current;
   return (
      <VStack as="section" gap={3} width="100%" aria-label={tx('Issue SLA')}>
         <HStack gap={2} vAlign="center" hAlign="between">
            <Heading level={4} accessibilityLevel={2}>
               {tx('Service level')}
            </Heading>
            {data && (
               <HStack gap={0.5}>
                  <Button
                     label={tx('Refresh SLA')}
                     tooltip={tx('Refresh SLA')}
                     icon={<RefreshCw className="size-4" />}
                     isIconOnly
                     variant="ghost"
                     size="sm"
                     onClick={() => setRefresh((value) => value + 1)}
                     isDisabled={busy}
                  />
                  <Button
                     label={tx('Use current SLA policy')}
                     tooltip={tx('Use current SLA policy')}
                     icon={<ListRestart className="size-4" />}
                     isIconOnly
                     variant="ghost"
                     size="sm"
                     onClick={() => setConfirm(true)}
                     isDisabled={
                        busy || ['completed', 'canceled'].includes(issue.status.category ?? '')
                     }
                  />
                  <Button
                     label={history ? tx('Hide SLA history') : tx('Show SLA history')}
                     tooltip={history ? tx('Hide SLA history') : tx('Show SLA history')}
                     icon={<History className="size-4" />}
                     isIconOnly
                     variant={history ? 'secondary' : 'ghost'}
                     size="sm"
                     aria-pressed={history}
                     onClick={() => setHistory(!history)}
                     isDisabled={busy}
                  />
               </HStack>
            )}
         </HStack>
         {data ? (
            <>
               <HStack gap={2} wrap="wrap">
                  <Token
                     label={
                        data.coverage === 'MANUAL'
                           ? tx('Manual deadline')
                           : current?.breachedAt
                             ? tx('Breached')
                             : enumLabel(current?.state ?? data.coverage)
                     }
                     color={
                        current?.breachedAt
                           ? 'red'
                           : current?.state === 'COMPLETED'
                             ? 'green'
                             : 'default'
                     }
                  />
                  {current && (
                     <Text>
                        {tx('{value0} · Revision {value1} · Cycle {value2}', {
                           value0: current.policyName,
                           value1: current.policyVersion,
                           value2: current.cycle,
                        })}
                     </Text>
                  )}
               </HStack>
               {current ? (
                  <>
                     <Text>
                        {tx('{value0} working minutes remaining · Deadline {value1}', {
                           value0: Math.ceil(current.remainingSeconds / 60),
                           value1: dateLabel(current.dueAt),
                        })}
                     </Text>
                     <Text>
                        {current.calendar
                           ? `Working timezone: ${current.calendar.timezone}`
                           : tx('Calendar: 24 hours, every day')}
                     </Text>
                     {current.escalationCode && (
                        <Text>
                           {tx('Escalation: {value0}', {
                              value0: current.escalationCode.toLowerCase().replaceAll('_', ' '),
                           })}
                        </Text>
                     )}
                     {Object.entries(current.alertResults).map(([kind, result]) => (
                        <Text key={kind}>
                           {tx('{value0}: {value1} · {value2} authorized recipients', {
                              value0: kind,
                              value1: result.outcome.toLowerCase().replaceAll('_', ' '),
                              value2: result.recipients,
                           })}
                        </Text>
                     ))}
                  </>
               ) : (
                  <Text>
                     {data.coverage === 'MANUAL'
                        ? tx('A manually chosen deadline disables SLA automation.')
                        : data.coverage === 'RESTRICTED'
                          ? tx('Earlier policy details are outside your current access.')
                          : tx(
                               'No SLA clock is attached. Older tasks have no reconstructed SLA history.'
                            )}
                  </Text>
               )}
               {data.pending && (
                  <Text role="status">
                     {tx(
                        'Recent changes are awaiting SLA processing. Refresh to check the updated clock.'
                     )}
                  </Text>
               )}
               {data.job?.failedAt && (
                  <>
                     <Text role="alert">
                        {tx('SLA processing stopped after repeated failures. Last error:')}{' '}
                        {data.job.errorCode}
                        {tx('. A retry keeps the existing clock.')}
                     </Text>
                     <Button
                        label={tx('Retry SLA processing')}
                        icon={<RotateCw className="size-4" />}
                        size="sm"
                        onClick={() => void command('retry')}
                        isDisabled={busy}
                     />
                  </>
               )}
               {confirm && (
                  <>
                     <Text>
                        {tx(
                           'Apply the currently matching policy and start a new clock now? This replaces the manual deadline or active cycle and preserves earlier cycles in history.'
                        )}
                     </Text>
                     <HStack gap={2} wrap="wrap">
                        <Button
                           label={tx('Confirm current SLA')}
                           variant="primary"
                           size="sm"
                           onClick={() => void command('apply')}
                           isLoading={busy}
                        />
                        <Button
                           label={tx('Keep existing SLA')}
                           variant="ghost"
                           size="sm"
                           onClick={() => setConfirm(false)}
                           isDisabled={busy}
                        />
                     </HStack>
                  </>
               )}
               {history && (
                  <>
                     <List hasDividers>
                        {data.history.map((row) => (
                           <ListItem
                              key={row.cycle}
                              label={tx('Cycle {value0} · {value1}', {
                                 value0: row.cycle,
                                 value1: row.policyName,
                              })}
                              description={
                                 <VStack gap={1}>
                                    <Text>
                                       {tx(
                                          '{value0} · Policy revision {value1} · Started {value2} · Closed {value3}',
                                          {
                                             value0: enumLabel(row.state),
                                             value1: row.policyVersion,
                                             value2: dateLabel(row.startedAt),
                                             value3: dateLabel(row.closedAt),
                                          }
                                       )}
                                    </Text>
                                    <Text>
                                       {tx('Deadline {value0} · Breached {value1}', {
                                          value0: dateLabel(row.dueAt),
                                          value1: dateLabel(row.breachedAt),
                                       })}
                                    </Text>
                                 </VStack>
                              }
                           />
                        ))}
                     </List>
                     <Text>
                        {tx('{value0} of {value1} accessible SLA cycles', {
                           value0: data.history.length,
                           value1: page?.total ?? 0,
                        })}
                     </Text>
                     {page?.nextBefore && (
                        <Button
                           label={tx('Load more SLA cycles')}
                           onClick={() => void load(page.nextBefore ?? undefined)}
                           isDisabled={busy}
                        />
                     )}
                  </>
               )}
            </>
         ) : (
            <Text>{error ? tx('SLA unavailable.') : tx('Loading SLA…')}</Text>
         )}
         {error && (
            <>
               <Text role="alert">{error}</Text>
               <Button
                  label={tx('Reload SLA')}
                  icon={<RotateCw className="size-4" />}
                  size="sm"
                  onClick={() => setRefresh((value) => value + 1)}
                  isDisabled={busy}
               />
            </>
         )}
      </VStack>
   );
}
