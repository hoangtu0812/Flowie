'use client';
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { QueryState } from '@/components/common/query-state';
import { EvidenceVerification } from './evidence-verification';
import { useParams } from 'next/navigation';
type Overview = {
   limits: { totalPerMinute: number; perTool: Record<string, number> };
   usage: number;
   tools: { tool: string; calls: number; errors: number; p95Ms: number | null }[];
   runs: { state: string; count: number; expiredLeases: number }[];
   recentErrors: { tool: string; outcome: string; createdAt: string }[];
   evidencePolicy: string;
   awaitingReview: { id: string }[];
};
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export function OperationsPage() {
   const { orgId } = useParams<{ orgId: string }>();
   const [data, setData] = useState<Overview>(),
      [error, setError] = useState<string>(),
      [refresh, setRefresh] = useState(0);
   const [workspace, setWorkspace] = useState<string>(),
      [total, setTotal] = useState('300'),
      [perTool, setPerTool] = useState('{}');
   useEffect(() => {
      let active = true;
      setData(undefined);
      setWorkspace(undefined);
      setError(undefined);
      void (async () => {
         try {
            const ws = await loadCurrentWorkspace();
            const overview = await responseData<Overview>(
               await authenticatedFetch(
                  `${api}/ai-operations?${new URLSearchParams({ workspaceId: ws.id })}`
               )
            );
            if (active) {
               setWorkspace(ws.id);
               setData(overview);
               setTotal(String(overview.limits.totalPerMinute));
               setPerTool(JSON.stringify(overview.limits.perTool, null, 2));
               setError(undefined);
            }
         } catch (reason) {
            if (active)
               setError(reason instanceof Error ? reason.message : 'Could not load AI operations.');
         }
      })();
      return () => {
         active = false;
      };
   }, [refresh, orgId]);
   return (
      <DesignSurface>
         <VStack as="main" padding={6} gap={4} maxWidth={960} isScrollable>
            <Heading level={1}>AI operations</Heading>
            <Text>
               Workspace administrators manage limits and review the last 24 hours of tool
               execution.
            </Text>
            <Button label="Refresh operations" onClick={() => setRefresh((n) => n + 1)} />
            {error && <QueryState message={error} />}{' '}
            {!data && !error && <Text role="status">Loading operations…</Text>}
            {data && (
               <>
                  <Heading level={2}>Workspace budget</Heading>
                  <Text>
                     {data.usage} / {data.limits.totalPerMinute} tool attempts in this minute
                  </Text>
                  <TextInput
                     label="Total tool calls per minute"
                     value={total}
                     onChange={setTotal}
                  />
                  <TextArea
                     label="Per-tool budgets (JSON)"
                     value={perTool}
                     onChange={setPerTool}
                     rows={4}
                  />
                  <Button
                     label="Save budgets"
                     clickAction={async () => {
                        try {
                           const parsed: unknown = JSON.parse(perTool);
                           if ((await loadCurrentWorkspace()).id !== workspace)
                              throw new Error('Workspace changed. Reload operations.');
                           if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
                              throw new Error(
                                 'Use a JSON object of tool names and positive limits.'
                              );
                           await responseData(
                              await authenticatedFetch(
                                 `${api}/ai-operations/limits?${new URLSearchParams({ workspaceId: workspace! })}`,
                                 {
                                    method: 'PUT',
                                    headers: { 'content-type': 'application/json' },
                                    body: JSON.stringify({
                                       totalPerMinute: Number(total),
                                       perTool: parsed,
                                    }),
                                 }
                              )
                           );
                           setRefresh((n) => n + 1);
                        } catch (reason) {
                           setError(
                              reason instanceof Error ? reason.message : 'Could not save limits.'
                           );
                        }
                     }}
                  />
                  <Heading level={2}>Tool calls</Heading>
                  {data.tools.length === 0 && <Text>No recorded tool calls in this period.</Text>}
                  {data.tools.map((tool) => (
                     <HStack key={tool.tool} gap={3} wrap="wrap">
                        <Text weight="medium">{tool.tool}</Text>
                        <Text>
                           {tool.calls} calls · {tool.errors} errors · p95{' '}
                           {tool.p95Ms === null ? 'unavailable' : Math.round(tool.p95Ms) + ' ms'}
                        </Text>
                     </HStack>
                  ))}
                  <Heading level={2}>Agent runs</Heading>
                  {data.runs.map((run) => (
                     <Text key={run.state}>
                        {run.state}: {run.count} · expired leases {run.expiredLeases}
                     </Text>
                  ))}
                  <Text>{data.evidencePolicy}</Text>
                  {workspace &&
                     data.awaitingReview.map((run) => (
                        <EvidenceVerification key={run.id} runId={run.id} workspaceId={workspace} />
                     ))}
                  <Heading level={2}>Recent errors</Heading>
                  {data.recentErrors.map((item, index) => (
                     <Text key={index}>
                        {item.tool} · {item.outcome} · {new Date(item.createdAt).toLocaleString()}
                     </Text>
                  ))}
               </>
            )}
         </VStack>
      </DesignSurface>
   );
}
