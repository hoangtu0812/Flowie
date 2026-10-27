'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/sla/messages.vi';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { Token } from '@astryxdesign/core/Token';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { DesignSurface } from '@/components/common/design-surface';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { useWorkspaceTeams } from '@/features/shared/use-workspace-teams';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { PolicyEditor } from './policy-editor';
import { RevisionHistory } from './revision-history';
import { SlaReportSummary } from './report-summary';
import { slaApi, type SlaPolicy } from './types';
import { SettingsShell } from '@/components/common/settings/shared';

export default function SlaSettings() {
   const tx = useMessages(messages);

   const { orgId } = useParams<{ orgId: string }>();
   const scope = useWorkspaceTeams(orgId);
   if (scope.error)
      return (
         <RecoveryScreen
            title={tx('SLA settings unavailable')}
            message={scope.error}
            retry={scope.reload}
         />
      );
   if (!scope.workspace)
      return (
         <DesignSurface>
            <VStack padding={6}>
               <Text>{tx('Loading SLA settings…')}</Text>
            </VStack>
         </DesignSurface>
      );
   return (
      <SlaCenter
         key={scope.workspace}
         workspace={scope.workspace}
         manager={!!scope.manager}
         teams={scope.teams ?? []}
      />
   );
}
function SlaCenter({
   workspace,
   manager,
   teams,
}: {
   workspace: string;
   manager: boolean;
   teams: { id: string; name: string }[];
}) {
   const tx = useMessages(messages);

   const [archived, setArchived] = useState(false),
      [editor, setEditor] = useState<SlaPolicy | 'new'>(),
      [selected, setSelected] = useState<SlaPolicy>();
   const [busy, setBusy] = useState(false),
      [error, setError] = useState('');
   const scope = new URLSearchParams({
      workspaceId: workspace,
      includeArchived: String(archived),
   }).toString();
   const policies = usePagedResource<SlaPolicy>(`${slaApi}?${scope}`);
   const alive = useRef(true);
   useEffect(() => {
      alive.current = true;
      return () => {
         alive.current = false;
      };
   }, []);
   const command = async (row: SlaPolicy) => {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
         await responseData(
            await authenticatedFetch(
               `${slaApi}/${row.id}/${row.archivedAt ? 'restore' : 'archive'}?${new URLSearchParams({ workspaceId: workspace })}`,
               {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ expectedVersion: row.version }),
               }
            )
         );
         if (alive.current) {
            setSelected(undefined);
            policies.reload();
         }
      } catch (reason) {
         if (alive.current) setError(String(reason));
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   return (
      <DesignSurface>
         <SettingsShell
            title={tx('SLA policies')}
            description={tx(
               'Team-specific policies take precedence, followed by priority-specific policies. Ties use the oldest policy. Manual deadlines opt out; applying a current policy on a task starts a new clock.'
            )}
         >
            <VStack gap={5} width="100%">
               <HStack gap={2} wrap="wrap">
                  {manager && (
                     <Button
                        label={tx('New SLA')}
                        variant="primary"
                        onClick={() => setEditor('new')}
                        isDisabled={busy || !!editor}
                     />
                  )}
                  <Button
                     label={tx('Refresh SLA policies')}
                     onClick={policies.reload}
                     isDisabled={busy}
                  />
               </HStack>
               <CheckboxInput
                  label={tx('Include archived policies')}
                  value={archived}
                  onChange={(value) => {
                     setArchived(value);
                     setSelected(undefined);
                  }}
                  isDisabled={busy}
               />
               {editor && (
                  <PolicyEditor
                     key={editor === 'new' ? 'new' : editor.id}
                     workspace={workspace}
                     teams={teams}
                     policy={editor === 'new' ? undefined : editor}
                     onSaved={() => {
                        setEditor(undefined);
                        setSelected(undefined);
                        policies.reload();
                     }}
                     onCancel={() => setEditor(undefined)}
                  />
               )}
               {error && <Text role="alert">{error}</Text>}
               <List hasDividers>
                  {policies.items.map((row) => (
                     <ListItem
                        key={row.id}
                        label={row.name}
                        description={
                           <VStack gap={2} width="100%">
                              <HStack gap={2} wrap="wrap">
                                 <Token
                                    label={
                                       row.archivedAt
                                          ? tx('Archived')
                                          : row.enabled
                                            ? 'Enabled'
                                            : 'Disabled'
                                    }
                                 />
                                 <Text>
                                    {tx('{value0} working minutes · Revision {value1} · {value2}', {
                                       value0: row.deadlineMinutes,
                                       value1: row.version,
                                       value2: row.calendar?.timezone ?? '24/7',
                                    })}
                                 </Text>
                              </HStack>
                              <Text>{`${row.teamId ? (teams.find((team) => team.id === row.teamId)?.name ?? tx('Team policy')) : tx('All teams')} · ${row.priority ?? tx('Any priority')}`}</Text>
                              <HStack gap={2} wrap="wrap">
                                 <Button
                                    label={tx('Policy history')}
                                    onClick={() => setSelected(row)}
                                    isDisabled={busy || !!editor || policies.loading}
                                 />
                                 {manager && (
                                    <>
                                       <Button
                                          label={tx('Edit SLA')}
                                          onClick={() => setEditor(row)}
                                          isDisabled={busy || !!editor}
                                       />
                                       <Button
                                          label={
                                             row.archivedAt ? tx('Restore SLA') : tx('Archive SLA')
                                          }
                                          onClick={() => void command(row)}
                                          isDisabled={busy || !!editor}
                                       />
                                    </>
                                 )}
                              </HStack>
                           </VStack>
                        }
                     />
                  ))}
               </List>
               {!policies.loading && !policies.error && !policies.items.length && (
                  <Text>{tx('No accessible SLA policies.')}</Text>
               )}
               <ResourcePagination
                  count={policies.items.length}
                  {...policies}
                  label={tx('SLA policies')}
               />
               {selected && (
                  <RevisionHistory
                     key={`${selected.id}:${selected.version}`}
                     workspace={workspace}
                     policy={selected}
                  />
               )}
               <SlaReportSummary workspace={workspace} teams={teams} />
            </VStack>
         </SettingsShell>
      </DesignSurface>
   );
}
