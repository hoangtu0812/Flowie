'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/archive/messages.vi';
import { useDateFormatter } from '@/features/shared/account-time';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Selector } from '@astryxdesign/core/Selector';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, loadCurrentWorkspaceMembership } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { SettingsShell } from '@/components/common/settings/shared';

type Archived = { id: string; title: string; kind: string; archivedAt: string; updatedAt: string };
type Preview = Archived & {
   relatedArchivedIssues: number;
   blockers: string[];
   canRestore: boolean;
   retention: string;
   effect: string;
};
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function ArchivePage() {
   const tx = useMessages(messages);

   const { orgId } = useParams<{ orgId: string }>();
   const [retry, setRetry] = useState(0);
   const [scope, setScope] = useState<{
      org: string;
      workspace?: string;
      manager?: boolean;
      error?: string;
   }>();
   useEffect(() => {
      let current = true;
      void loadCurrentWorkspaceMembership(orgId)
         .then((membership) => {
            if (current)
               setScope({
                  org: orgId,
                  workspace: membership.workspace.id,
                  manager: membership.role !== 'MEMBER',
               });
         })
         .catch((reason) => {
            if (current)
               setScope({
                  org: orgId,
                  error: reason instanceof Error ? reason.message : tx('Could not load archive.'),
               });
         });
      return () => {
         current = false;
      };
   }, [orgId, retry, tx]);
   if (scope?.org === orgId && scope.error)
      return (
         <RecoveryScreen
            title={tx('Could not load archive')}
            message={scope.error}
            retry={() => setRetry((value) => value + 1)}
         />
      );
   if (scope?.org !== orgId || !scope.workspace)
      return (
         <DesignSurface>
            <Text role="status">{tx('Loading archive…')}</Text>
         </DesignSurface>
      );
   return (
      <ArchiveCenter
         key={`${orgId}:${scope.workspace}`}
         workspace={scope.workspace}
         manager={!!scope.manager}
         org={orgId}
      />
   );
}

function ArchiveCenter({
   workspace,
   manager,
   org,
}: {
   workspace: string;
   manager: boolean;
   org: string;
}) {
   const tx = useMessages(messages);
   const dateLabel = useDateFormatter();

   const [kind, setKind] = useState('issue');
   const [preview, setPreview] = useState<Preview>();
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState('');
   const [restored, setRestored] = useState<{ title: string; href: string }>();
   const generation = useRef(0);
   const records = usePagedResource<Archived>(
      `${api}/archive?${new URLSearchParams({ workspaceId: workspace, kind })}`
   );
   useEffect(() => {
      generation.current++;
      setPreview(undefined);
      setError('');
      setBusy(false);
      return () => {
         generation.current++;
      };
   }, [kind]);
   const select = async (row: Archived) => {
      const request = ++generation.current;
      setBusy(true);
      setError('');
      setRestored(undefined);
      try {
         const data = await responseData<Preview>(
            await authenticatedFetch(
               `${api}/archive/${kind}/${row.id}/preview?workspaceId=${workspace}`
            )
         );
         if (request === generation.current) setPreview(data);
      } catch (reason) {
         if (request === generation.current)
            setError(
               reason instanceof Error ? reason.message : tx('Could not preview restoration.')
            );
      } finally {
         if (request === generation.current) setBusy(false);
      }
   };
   const restore = async () => {
      if (!preview || !preview.canRestore || busy) return;
      const request = ++generation.current;
      setBusy(true);
      setError('');
      try {
         await responseData(
            await authenticatedFetch(
               `${api}/archive/${kind}/${preview.id}/restore?workspaceId=${workspace}`,
               {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ expectedUpdatedAt: preview.updatedAt }),
               }
            )
         );
         if (request !== generation.current) return;
         const path =
            kind === 'issue'
               ? `issue/${preview.id}`
               : kind === 'project'
                 ? `project/${preview.id}/overview`
                 : kind === 'document'
                   ? `documents/${preview.id}`
                   : `initiative/${preview.id}`;
         setRestored({ title: preview.title, href: `/${org}/${path}` });
         setPreview(undefined);
         records.reload();
      } catch (reason) {
         if (request === generation.current)
            setError(reason instanceof Error ? reason.message : tx('Could not restore record.'));
      } finally {
         if (request === generation.current) setBusy(false);
      }
   };
   return (
      <DesignSurface>
         <SettingsShell
            title={tx('Archived records')}
            description={tx(
               'Review archived items you can access and restore their existing relationships. Automatic permanent deletion is disabled.'
            )}
         >
            <VStack gap={4} width="100%">
               <Selector
                  label={tx('Record type')}
                  value={kind}
                  onChange={setKind}
                  isDisabled={busy}
                  options={[
                     { value: 'issue', label: tx('Tasks and bugs') },
                     { value: 'project', label: tx('Projects') },
                     { value: 'document', label: tx('Documents') },
                     ...(manager ? [{ value: 'initiative', label: tx('Initiatives') }] : []),
                  ]}
               />
               {error && !preview && <Text role="alert">{error}</Text>}
               {restored && (
                  <HStack gap={3} wrap="wrap">
                     <Text role="status">
                        {tx('Restored')} {restored.title}
                     </Text>
                     <Button label={tx('Open restored record')} href={restored.href} />
                  </HStack>
               )}
               <List hasDividers>
                  {records.items.map((row) => (
                     <ListItem
                        key={row.id}
                        label={row.title}
                        description={
                           <VStack gap={2}>
                              <Text>
                                 {tx('Archived {date}', { date: dateLabel(row.archivedAt) })}
                              </Text>
                              <HStack wrap="wrap">
                                 <Button
                                    label={tx('Preview restore')}
                                    aria-label={tx('Preview restore {title}', { title: row.title })}
                                    onClick={() => void select(row)}
                                    isDisabled={busy}
                                 />
                              </HStack>
                           </VStack>
                        }
                     />
                  ))}
               </List>
               {!records.loading && !records.error && !records.items.length && (
                  <Text>{tx('No accessible archived records of this type.')}</Text>
               )}
               <ResourcePagination
                  count={records.items.length}
                  {...records}
                  label={tx('archived records')}
               />
               <Dialog
                  isOpen={!!preview}
                  onOpenChange={(open) => {
                     if (!open && !busy) setPreview(undefined);
                  }}
                  purpose="form"
                  padding={5}
               >
                  <VStack gap={4}>
                     <DialogHeader
                        title={tx('Restore archived record')}
                        onOpenChange={(open) => {
                           if (!open && !busy) setPreview(undefined);
                        }}
                     />
                     {preview && (
                        <>
                           <Heading level={2}>{preview.title}</Heading>
                           <Text>
                              {preview.kind === 'project'
                                 ? tx(
                                      'Restore this project. {count} accessible archived tasks can then be restored individually.',
                                      { count: preview.relatedArchivedIssues }
                                   )
                                 : tx(preview.effect as keyof typeof messages)}
                           </Text>
                           <Text>{tx(preview.retention as keyof typeof messages)}</Text>
                           {preview.blockers.map((message) => (
                              <Text key={message} role="alert">
                                 {tx(message as keyof typeof messages)}
                              </Text>
                           ))}
                           {error && <Text role="alert">{error}</Text>}
                           <HStack gap={3} wrap="wrap">
                              <Button
                                 label={tx('Restore record')}
                                 isDisabled={!preview.canRestore}
                                 isLoading={busy}
                                 onClick={() => void restore()}
                              />
                              <Button
                                 label={tx('Cancel restore')}
                                 isDisabled={busy}
                                 onClick={() => setPreview(undefined)}
                              />
                           </HStack>
                        </>
                     )}
                  </VStack>
               </Dialog>
            </VStack>
         </SettingsShell>
      </DesignSurface>
   );
}
