'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { SettingsSection, SettingsShell } from '@/components/common/settings/shared';
import { RefreshIconButton } from '@/features/shared/refresh-icon-button';
import { formatLag } from './format-lag';

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
   // One line per row: name on the left, measurements on the right; wraps on phones.
   // VI: Mỗi hàng một dòng: tên bên trái, số liệu bên phải; xuống dòng trên điện thoại.
   const row = 'flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 px-4 py-2';
   const list = 'rounded-lg border bg-container divide-y divide-border/60';
   return (
      <DesignSurface>
         <SettingsShell
            title="Operations"
            description="Delivery queues, background tasks and browser errors for this deployment"
            action={<RefreshIconButton label="Refresh operations" onClick={reload} />}
         >
            {error && <Text role="alert">{error}</Text>}
            {!data && !error && <Text role="status">Loading operations…</Text>}
            {data && (
               <>
                  <SettingsSection title="Delivery queues" description={`Build: ${data.revision}`}>
                     <ul className={list}>
                        {data.queues.map((queue) => (
                           <li key={queue.name} className={row}>
                              <span className="text-sm font-medium">{queue.name}</span>
                              <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                 <span>{queue.pending} pending</span>
                                 {queue.failed > 0 ? (
                                    <Token size="sm" color="red" label={`${queue.failed} failed`} />
                                 ) : (
                                    <span>0 failed</span>
                                 )}
                                 <span>{formatLag(queue.lagSeconds)} queue lag</span>
                              </span>
                           </li>
                        ))}
                     </ul>
                  </SettingsSection>
                  <SettingsSection
                     title="Background tasks"
                     description="Heartbeats track process liveness; progress records the last completed scan. The list shows live instances and the latest state for each job."
                  >
                     {data.jobsTruncated && (
                        <Text role="alert">
                           More than 100 recent job instances match. Some instances are omitted.
                        </Text>
                     )}
                     <ul className={list}>
                        {data.jobs.map((job) => (
                           <li key={`${job.instance}/${job.job}`} className={row}>
                              <span className="flex items-center gap-2 text-sm font-medium">
                                 {job.job}
                                 <Token
                                    size="sm"
                                    label={job.status}
                                    color={
                                       job.status === 'running'
                                          ? 'green'
                                          : job.failures > 0
                                            ? 'red'
                                            : 'default'
                                    }
                                 />
                              </span>
                              <span className="text-xs text-muted-foreground">
                                 {`Seen ${new Date(job.lastSeenAt).toLocaleString()} · Progress ${job.lastProgressAt ? new Date(job.lastProgressAt).toLocaleString() : 'not yet recorded'} · ${job.failures} failures${job.lastErrorCode ? ' · ' + job.lastErrorCode : ''}`}
                              </span>
                           </li>
                        ))}
                     </ul>
                  </SettingsSection>
                  <SettingsSection title="Browser errors in the last 24 hours">
                     <ul className={list}>
                        {!data.clientErrors.length && (
                           <li className={row}>
                              <span className="text-sm text-muted-foreground">
                                 No browser errors reported.
                              </span>
                           </li>
                        )}
                        {data.clientErrors.map((item) => (
                           <li key={`${item.category}/${item.route_kind}`} className={row}>
                              <span className="text-sm font-medium">{`${item.category} · ${item.route_kind}`}</span>
                              <span className="text-xs text-muted-foreground">
                                 {item.count} reports
                              </span>
                           </li>
                        ))}
                     </ul>
                  </SettingsSection>
               </>
            )}
         </SettingsShell>
      </DesignSurface>
   );
}
