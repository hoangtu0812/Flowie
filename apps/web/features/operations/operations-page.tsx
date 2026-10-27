'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { SettingsShell } from '@/components/common/settings/shared';

type Operations = {
   revision: string;
   jobsTruncated?: boolean;
   jobs: {
      instance: string;
      job: string;
      status: string;
      lastSeenAt: string;
      lastProgressAt: string | null;
      failures: number;
      lastErrorCode: string | null;
   }[];
   queues: { name: string; pending: number; failed: number; lagSeconds: number }[];
   clientErrors: { category: string; route_kind: string; count: number }[];
};
export default function OperationsPage() {
   const { orgId } = useParams<{ orgId: string }>();
   const [version, setVersion] = useState(0);
   const [result, setResult] = useState<{ scope: string; data?: Operations; error?: string }>();
   const reload = useCallback(() => setVersion((value) => value + 1), []);
   useEffect(() => {
      let active = true;
      void (async () => {
         try {
            const workspace = await loadCurrentWorkspace(orgId);
            const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
            const data = await responseData<Operations>(
               await authenticatedFetch(`${api}/operations?workspaceId=${workspace.id}`)
            );
            if (active) setResult({ scope: orgId, data });
         } catch (reason) {
            if (active)
               setResult({
                  scope: orgId,
                  error: reason instanceof Error ? reason.message : 'Could not load operations.',
               });
         }
      })();
      return () => {
         active = false;
      };
   }, [orgId, version]);
   const data = result?.scope === orgId ? result.data : undefined;
   const error = result?.scope === orgId ? result.error : undefined;
   return (
      <DesignSurface>
         <SettingsShell
            title="Operations"
            description="Delivery queues, background tasks and browser errors for this deployment"
         >
            <VStack gap={5} width="100%">
               <Button label="Refresh operations" onClick={reload} />
               {error && <Text role="alert">{error}</Text>}
               {!data && !error && <Text role="status">Loading operations…</Text>}
               {data && (
                  <>
                     <Text>Build: {data.revision}</Text>
                     <Heading level={2}>Delivery queues</Heading>
                     <List hasDividers>
                        {data.queues.map((queue) => (
                           <ListItem
                              key={queue.name}
                              label={queue.name}
                              description={`${queue.pending} pending · ${queue.failed} failed · ${queue.lagSeconds}s queue lag`}
                           />
                        ))}
                     </List>
                     <Heading level={2}>Background tasks</Heading>
                     <Text>
                        Heartbeats track process liveness; progress records the last completed scan.
                        The list shows live instances and the latest state for each job.
                     </Text>
                     {data.jobsTruncated && (
                        <Text role="alert">
                           More than 100 recent job instances match. Some instances are omitted.
                        </Text>
                     )}
                     <List hasDividers>
                        {data.jobs.map((job) => (
                           <ListItem
                              key={`${job.instance}/${job.job}`}
                              label={`${job.job} · ${job.status}`}
                              description={`Seen ${new Date(job.lastSeenAt).toLocaleString()} · Progress ${job.lastProgressAt ? new Date(job.lastProgressAt).toLocaleString() : 'not yet recorded'} · ${job.failures} failures${job.lastErrorCode ? ' · ' + job.lastErrorCode : ''}`}
                           />
                        ))}
                     </List>
                     <Heading level={2}>Browser errors in the last 24 hours</Heading>
                     {!data.clientErrors.length && <Text>No browser errors reported.</Text>}
                     <List hasDividers>
                        {data.clientErrors.map((row) => (
                           <ListItem
                              key={`${row.category}/${row.route_kind}`}
                              label={`${row.category} · ${row.route_kind}`}
                              description={`${row.count} reports`}
                           />
                        ))}
                     </List>
                  </>
               )}
            </VStack>
         </SettingsShell>
      </DesignSurface>
   );
}
