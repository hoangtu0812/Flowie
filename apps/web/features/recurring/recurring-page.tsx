'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { DesignSurface } from '@/components/common/design-surface';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { authenticatedFetch, loadCurrentWorkspaceMembership } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { ScheduleEditor } from './schedule-editor';
import { recurringApi, type Schedule, type Run } from './types';

export default function RecurringPage() {
   const { orgId } = useParams<{ orgId: string }>();
   const [scope, setScope] = useState<{
      org: string;
      workspace?: string;
      manager?: boolean;
      teams?: { id: string; name: string }[];
      error?: string;
   }>();
   const [retry, setRetry] = useState(0);
   useEffect(() => {
      let active = true;
      void (async () => {
         const member = await loadCurrentWorkspaceMembership(orgId);
         const teams = await responseData<{ id: string; name: string; joined: boolean }[]>(
            await authenticatedFetch(
               `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/teams?workspaceId=${member.workspace.id}`
            )
         );
         if (active)
            setScope({
               org: orgId,
               workspace: member.workspace.id,
               manager: member.role !== 'MEMBER',
               teams: teams.filter((row) => row.joined),
            });
      })().catch((reason) => {
         if (active)
            setScope({
               org: orgId,
               error: reason instanceof Error ? reason.message : 'Could not load schedules.',
            });
      });
      return () => {
         active = false;
      };
   }, [orgId, retry]);
   if (scope?.org === orgId && scope.error)
      return (
         <RecoveryScreen
            title="Recurring schedules unavailable"
            message={scope.error}
            retry={() => setRetry((value) => value + 1)}
         />
      );
   if (scope?.org !== orgId || !scope.workspace)
      return (
         <DesignSurface>
            <Text role="status">Loading recurring schedules…</Text>
         </DesignSurface>
      );
   return (
      <ScheduleCenter
         key={scope.workspace}
         workspace={scope.workspace}
         manager={!!scope.manager}
         teams={scope.teams ?? []}
      />
   );
}

function ScheduleCenter({
   workspace,
   manager,
   teams,
}: {
   workspace: string;
   manager: boolean;
   teams: { id: string; name: string }[];
}) {
   const scope = new URLSearchParams({ workspaceId: workspace }).toString();
   const schedules = usePagedResource<Schedule>(`${recurringApi}?${scope}`);
   const [editor, setEditor] = useState<Schedule | 'new'>();
   const [selected, setSelected] = useState<Schedule>();
   const [error, setError] = useState(''),
      [busy, setBusy] = useState(false);
   const alive = useRef(true),
      runKey = useRef<Record<string, string>>({});
   useEffect(() => {
      alive.current = true;
      return () => {
         alive.current = false;
      };
   }, []);
   const history = usePagedResource<Run>(
      selected ? `${recurringApi}/${selected.id}/runs?${scope}` : undefined
   );
   const command = async (row: Schedule, name: string) => {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
         if (name === 'run-now' && !runKey.current[row.id])
            runKey.current[row.id] = crypto.randomUUID();
         const result = await responseData<Schedule>(
            await authenticatedFetch(`${recurringApi}/${row.id}/${name}?${scope}`, {
               method: 'POST',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  expectedVersion: row.version,
                  ...(name === 'run-now' ? { requestKey: runKey.current[row.id] } : {}),
               }),
            })
         );
         if (!alive.current) return;
         if (name === 'run-now') delete runKey.current[row.id];
         setSelected(result);
         schedules.reload();
         history.reload();
      } catch (reason) {
         if (alive.current)
            setError(
               reason instanceof Error
                  ? reason.message
                  : 'Could not update schedule. Reload the list before retrying.'
            );
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   return (
      <DesignSurface>
         <VStack padding={6} gap={5} width="100%" className="h-full overflow-auto">
            <Heading level={1}>Recurring schedules</Heading>
            <Text>
               Schedules create tasks using their original creator&apos;s current permissions.
               Workspace managers configure schedules for teams they belong to. Three consecutive
               failed runs pause a schedule. Run now adds one extra task and leaves the regular
               schedule unchanged.
            </Text>
            <HStack gap={3} wrap="wrap">
               {manager && (
                  <Button
                     label="New recurring schedule"
                     onClick={() => setEditor('new')}
                     isDisabled={busy || !teams.length}
                  />
               )}
               <Button label="Refresh schedules" onClick={schedules.reload} />
            </HStack>
            {editor && (
               <ScheduleEditor
                  key={editor === 'new' ? 'new' : editor.id}
                  workspace={workspace}
                  teams={teams}
                  schedule={editor === 'new' ? undefined : editor}
                  onSaved={() => {
                     setEditor(undefined);
                     schedules.reload();
                  }}
                  onCancel={() => setEditor(undefined)}
               />
            )}
            {error && <Text role="alert">{error}</Text>}
            <List hasDividers>
               {schedules.items.map((row) => (
                  <ListItem
                     key={row.id}
                     label={row.name}
                     description={
                        <VStack gap={2} width="100%">
                           <Text type="supporting">{`${row.active ? 'Active' : 'Paused'} · ${row.rule.frequency} · ${row.rule.timezone} · Next ${new Date(row.nextRunAt).toLocaleString()} · Failed runs ${row.consecutiveFailures}`}</Text>
                           <HStack gap={2} wrap="wrap">
                              <Button
                                 label="History"
                                 onClick={() => {
                                    setSelected(row);
                                 }}
                              />
                              {manager && (
                                 <>
                                    <Button
                                       label="Edit"
                                       onClick={() => setEditor(row)}
                                       isDisabled={busy}
                                    />
                                    <Button
                                       label={row.active ? 'Pause' : 'Resume'}
                                       onClick={() =>
                                          void command(row, row.active ? 'pause' : 'resume')
                                       }
                                       isDisabled={busy}
                                    />
                                    <Button
                                       label="Run now"
                                       onClick={() => void command(row, 'run-now')}
                                       isDisabled={busy || !row.active}
                                    />
                                 </>
                              )}
                           </HStack>
                        </VStack>
                     }
                  />
               ))}
            </List>
            {!schedules.loading && !schedules.error && !schedules.items.length && (
               <Text>No accessible recurring schedules.</Text>
            )}
            <ResourcePagination count={schedules.items.length} {...schedules} label="schedules" />
            {selected && (
               <>
                  <Heading level={2}>Run history: {selected.name}</Heading>
                  <Text>
                     Queued manual runs use the template revision accepted at the time of the
                     request. Pause cancels queued runs; completed tasks are preserved.
                  </Text>
                  <Button label="Refresh run history" onClick={history.reload} />
                  <List hasDividers>
                     {history.items.map((row) => (
                        <ListItem
                           key={row.id}
                           label={`${row.state}${row.identifier ? ' · ' + row.identifier : ''}`}
                           description={`${new Date(row.scheduledFor).toLocaleString()} · Revision ${row.scheduleVersion}${row.errorCode ? ' · ' + row.errorCode : ''}`}
                        />
                     ))}
                  </List>
                  <ResourcePagination
                     count={history.items.length}
                     {...history}
                     label="schedule runs"
                  />
               </>
            )}
         </VStack>
      </DesignSurface>
   );
}
