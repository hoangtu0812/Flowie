'use client';
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

type Archived = { id: string; title: string; kind: string; archivedAt: string; updatedAt: string };
type Preview = Archived & {
   blockers: string[];
   canRestore: boolean;
   retention: string;
   effect: string;
};
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function ArchivePage() {
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
                  error: reason instanceof Error ? reason.message : 'Could not load archive.',
               });
         });
      return () => {
         current = false;
      };
   }, [orgId, retry]);
   if (scope?.org === orgId && scope.error)
      return (
         <RecoveryScreen
            title="Could not load archive"
            message={scope.error}
            retry={() => setRetry((value) => value + 1)}
         />
      );
   if (scope?.org !== orgId || !scope.workspace)
      return (
         <DesignSurface>
            <Text role="status">Loading archive…</Text>
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
            setError(reason instanceof Error ? reason.message : 'Could not preview restoration.');
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
            setError(reason instanceof Error ? reason.message : 'Could not restore record.');
      } finally {
         if (request === generation.current) setBusy(false);
      }
   };
   return (
      <DesignSurface>
         <VStack padding={6} gap={4} className="h-full overflow-auto" width="100%">
            <Heading level={1}>Archived records</Heading>
            <Text>
               Review archived items you can access and restore their existing relationships.
               Automatic permanent deletion is disabled.
            </Text>
            <Selector
               label="Record type"
               value={kind}
               onChange={setKind}
               isDisabled={busy}
               options={[
                  { value: 'issue', label: 'Tasks and bugs' },
                  { value: 'project', label: 'Projects' },
                  { value: 'document', label: 'Documents' },
                  ...(manager ? [{ value: 'initiative', label: 'Initiatives' }] : []),
               ]}
            />
            {error && !preview && <Text role="alert">{error}</Text>}
            {restored && (
               <HStack gap={3} wrap="wrap">
                  <Text role="status">Restored {restored.title}</Text>
                  <Button label="Open restored record" href={restored.href} />
               </HStack>
            )}
            <List hasDividers>
               {records.items.map((row) => (
                  <ListItem
                     key={row.id}
                     label={row.title}
                     description={`Archived ${new Date(row.archivedAt).toLocaleString()}`}
                     endContent={
                        <Button
                           label="Preview restore"
                           aria-label={`Preview restore ${row.title}`}
                           onClick={() => void select(row)}
                           isDisabled={busy}
                        />
                     }
                  />
               ))}
            </List>
            {!records.loading && !records.error && !records.items.length && (
               <Text>No accessible archived records of this type.</Text>
            )}
            <ResourcePagination
               count={records.items.length}
               {...records}
               label="archived records"
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
                     title="Restore archived record"
                     onOpenChange={(open) => {
                        if (!open && !busy) setPreview(undefined);
                     }}
                  />
                  {preview && (
                     <>
                        <Heading level={2}>{preview.title}</Heading>
                        <Text>{preview.effect}</Text>
                        <Text>{preview.retention}</Text>
                        {preview.blockers.map((message) => (
                           <Text key={message} role="alert">
                              {message}
                           </Text>
                        ))}
                        {error && <Text role="alert">{error}</Text>}
                        <HStack gap={3} wrap="wrap">
                           <Button
                              label="Restore record"
                              isDisabled={!preview.canRestore}
                              isLoading={busy}
                              onClick={() => void restore()}
                           />
                           <Button
                              label="Cancel restore"
                              isDisabled={busy}
                              onClick={() => setPreview(undefined)}
                           />
                        </HStack>
                     </>
                  )}
               </VStack>
            </Dialog>
         </VStack>
      </DesignSurface>
   );
}
