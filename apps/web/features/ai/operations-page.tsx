'use client';
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { QueryState } from '@/components/common/query-state';
import { useParams } from 'next/navigation';
import { SettingsSection, SettingsShell } from '@/components/common/settings/shared';
import { RefreshIconButton } from '@/features/shared/refresh-icon-button';
type Overview = {
   limits: { totalPerMinute: number; perTool: Record<string, number> };
   usage: number;
   tools: { tool: string; calls: number; errors: number; p95Ms: number | null }[];
   recentErrors: { tool: string; outcome: string; createdAt: string }[];
   providerCalls: {
      feature: string;
      calls: number;
      failed: number;
      inputTokens: number;
      outputTokens: number;
      p95Ms: number | null;
   }[];
   recentProviderErrors: {
      feature: string;
      outcome: string;
      statusCode: number | null;
      model: string;
      createdAt: string;
   }[];
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
   const ms = (value: number | null) =>
      value === null ? 'unavailable' : Math.round(value) + ' ms';
   return (
      <DesignSurface>
         <SettingsShell
            title="AI operations"
            description="Workspace administrators manage limits and review the last 24 hours of tool execution."
            action={
               <RefreshIconButton
                  label="Refresh operations"
                  onClick={() => setRefresh((n) => n + 1)}
               />
            }
         >
            {error && <QueryState message={error} />}
            {!data && !error && <Text role="status">Loading operations…</Text>}
            {data && (
               <>
                  <SettingsSection
                     title="Workspace budget"
                     description={`${data.usage} / ${data.limits.totalPerMinute} tool attempts in this minute`}
                  >
                     <div className="flex flex-col gap-3 rounded-lg border bg-container px-4 py-3">
                        <TextInput
                           label="Total tool calls per minute"
                           size="sm"
                           width={200}
                           value={total}
                           onChange={setTotal}
                        />
                        <TextArea
                           label="Per-tool budgets (JSON)"
                           value={perTool}
                           onChange={setPerTool}
                           rows={4}
                        />
                        <div className="flex">
                           <Button
                              label="Save budgets"
                              size="sm"
                              clickAction={async () => {
                                 try {
                                    const parsed: unknown = JSON.parse(perTool);
                                    if ((await loadCurrentWorkspace()).id !== workspace)
                                       throw new Error('Workspace changed. Reload operations.');
                                    if (
                                       !parsed ||
                                       typeof parsed !== 'object' ||
                                       Array.isArray(parsed)
                                    )
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
                                       reason instanceof Error
                                          ? reason.message
                                          : 'Could not save limits.'
                                    );
                                 }
                              }}
                           />
                        </div>
                     </div>
                  </SettingsSection>
                  <SettingsSection title="Tool calls">
                     <StatRows
                        empty="No recorded tool calls in this period."
                        rows={data.tools.map((tool) => ({
                           key: tool.tool,
                           name: tool.tool,
                           detail: `${tool.calls} calls · ${tool.errors} errors · p95 ${ms(tool.p95Ms)}`,
                           alert: tool.errors > 0,
                        }))}
                     />
                  </SettingsSection>
                  <SettingsSection title="AI provider usage (last 7 days)">
                     <StatRows
                        empty="No AI provider calls in this period."
                        rows={data.providerCalls.map((call) => ({
                           key: call.feature,
                           name: call.feature,
                           detail: `${call.calls} calls · ${call.failed} failed · ${call.inputTokens.toLocaleString()} input tokens · ${call.outputTokens.toLocaleString()} output tokens · p95 ${ms(call.p95Ms)}`,
                           alert: call.failed > 0,
                        }))}
                     />
                  </SettingsSection>
                  {data.recentProviderErrors.length > 0 && (
                     <SettingsSection title="Recent AI provider errors">
                        <StatRows
                           rows={data.recentProviderErrors.map((item, index) => ({
                              key: String(index),
                              name: `${item.feature} · ${item.outcome}`,
                              detail: `${item.statusCode === null ? '' : `HTTP ${item.statusCode} · `}${item.model} · ${new Date(item.createdAt).toLocaleString()}`,
                           }))}
                        />
                     </SettingsSection>
                  )}
                  <SettingsSection title="Recent errors">
                     <StatRows
                        empty="No recent tool errors."
                        rows={data.recentErrors.map((item, index) => ({
                           key: String(index),
                           name: `${item.tool} · ${item.outcome}`,
                           detail: new Date(item.createdAt).toLocaleString(),
                        }))}
                     />
                  </SettingsSection>
               </>
            )}
         </SettingsShell>
      </DesignSurface>
   );
}

/**
 * Bordered list of one-line rows (name left, measurements right) used by every AI operations
 * section; the right part wraps under the name on narrow screens. `alert` marks a row that
 * has errors so it stands out without changing its text.
 * VI: Danh sách có viền gồm các hàng một dòng (tên bên trái, số liệu bên phải) dùng cho mọi mục
 * AI operations; phần bên phải xuống dưới tên ở màn hình hẹp. `alert` đánh dấu hàng có lỗi để
 * nổi bật mà không đổi nội dung chữ.
 */
function StatRows({
   rows,
   empty,
}: {
   rows: { key: string; name: string; detail: string; alert?: boolean }[];
   empty?: string;
}) {
   if (!rows.length && !empty) return null;
   return (
      <ul className="rounded-lg border bg-container divide-y divide-border/60">
         {!rows.length && <li className="px-4 py-2 text-sm text-muted-foreground">{empty}</li>}
         {rows.map((row) => (
            <li
               key={row.key}
               className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2"
            >
               <span className="text-sm font-medium">{row.name}</span>
               <span
                  className={row.alert ? 'text-xs text-red-500' : 'text-xs text-muted-foreground'}
               >
                  {row.detail}
               </span>
            </li>
         ))}
      </ul>
   );
}
