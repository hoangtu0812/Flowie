'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { Token } from '@astryxdesign/core/Token';
import type { Issue } from '@/mock-data/issues';
import { useIssuesStore } from '@/store/issues-store';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseEnvelope } from '@/lib/http';
import { slaApi, dateLabel, type IssueSla, type VersionPage } from './types';

export function IssueSlaPanel({ issue }: { issue: Issue }) {
   const workspace = useIssuesStore((state) => state.workspaceId);
   return workspace ? (
      <ClockPanel key={workspace + issue.id} workspace={workspace} issue={issue} />
   ) : null;
}
function ClockPanel({ workspace, issue }: { workspace: string; issue: Issue }) {
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
      <VStack as="section" gap={3} width="100%" aria-label="Issue SLA">
         <Heading level={2}>Service level</Heading>
         {data ? (
            <>
               <HStack gap={2} wrap="wrap">
                  <Token
                     label={
                        data.coverage === 'MANUAL'
                           ? 'Manual deadline'
                           : current?.breachedAt
                             ? 'Breached'
                             : (current?.state ?? data.coverage)
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
                     <Text>{`${current.policyName} · Revision ${current.policyVersion} · Cycle ${current.cycle}`}</Text>
                  )}
               </HStack>
               {current ? (
                  <>
                     <Text>{`${Math.ceil(current.remainingSeconds / 60)} working minutes remaining · Deadline ${dateLabel(current.dueAt)}`}</Text>
                     <Text>
                        {current.calendar
                           ? `Working timezone: ${current.calendar.timezone}`
                           : 'Calendar: 24 hours, every day'}
                     </Text>
                     {current.escalationCode && (
                        <Text>{`Escalation: ${current.escalationCode.toLowerCase().replaceAll('_', ' ')}`}</Text>
                     )}
                     {Object.entries(current.alertResults).map(([kind, result]) => (
                        <Text
                           key={kind}
                        >{`${kind}: ${result.outcome.toLowerCase().replaceAll('_', ' ')} · ${result.recipients} authorized recipients`}</Text>
                     ))}
                  </>
               ) : (
                  <Text>
                     {data.coverage === 'MANUAL'
                        ? 'A manually chosen deadline disables SLA automation.'
                        : data.coverage === 'RESTRICTED'
                          ? 'Earlier policy details are outside your current access.'
                          : 'No SLA clock is attached. Older tasks have no reconstructed SLA history.'}
                  </Text>
               )}
               {data.pending && (
                  <Text role="status">
                     Recent changes are awaiting SLA processing. Refresh to check the updated clock.
                  </Text>
               )}
               {data.job?.failedAt && (
                  <>
                     <Text role="alert">
                        SLA processing stopped after repeated failures. Last error:{' '}
                        {data.job.errorCode}. A retry keeps the existing clock.
                     </Text>
                     <Button
                        label="Retry SLA processing"
                        onClick={() => void command('retry')}
                        isDisabled={busy}
                     />
                  </>
               )}
               <HStack gap={2} wrap="wrap">
                  <Button
                     label="Refresh SLA"
                     onClick={() => setRefresh((value) => value + 1)}
                     isDisabled={busy}
                  />
                  <Button
                     label="Use current SLA policy"
                     onClick={() => setConfirm(true)}
                     isDisabled={
                        busy || ['completed', 'canceled'].includes(issue.status.category ?? '')
                     }
                  />
                  <Button
                     label={history ? 'Hide SLA history' : 'Show SLA history'}
                     onClick={() => setHistory(!history)}
                     isDisabled={busy}
                  />
               </HStack>
               {confirm && (
                  <>
                     <Text>
                        Apply the currently matching policy and start a new clock now? This replaces
                        the manual deadline or active cycle and preserves earlier cycles in history.
                     </Text>
                     <HStack gap={2} wrap="wrap">
                        <Button
                           label="Confirm current SLA"
                           onClick={() => void command('apply')}
                           isLoading={busy}
                        />
                        <Button
                           label="Keep existing SLA"
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
                              label={`Cycle ${row.cycle} · ${row.policyName}`}
                              description={
                                 <VStack gap={1}>
                                    <Text>{`${row.state} · Policy revision ${row.policyVersion} · Started ${dateLabel(row.startedAt)} · Closed ${dateLabel(row.closedAt)}`}</Text>
                                    <Text>{`Deadline ${dateLabel(row.dueAt)} · Breached ${dateLabel(row.breachedAt)}`}</Text>
                                 </VStack>
                              }
                           />
                        ))}
                     </List>
                     <Text>{`${data.history.length} of ${page?.total ?? 0} accessible SLA cycles`}</Text>
                     {page?.nextBefore && (
                        <Button
                           label="Load more SLA cycles"
                           onClick={() => void load(page.nextBefore ?? undefined)}
                           isDisabled={busy}
                        />
                     )}
                  </>
               )}
            </>
         ) : (
            <Text>{error ? 'SLA unavailable.' : 'Loading SLA…'}</Text>
         )}
         {error && (
            <>
               <Text role="alert">{error}</Text>
               <Button
                  label="Reload SLA"
                  onClick={() => setRefresh((value) => value + 1)}
                  isDisabled={busy}
               />
            </>
         )}
      </VStack>
   );
}
