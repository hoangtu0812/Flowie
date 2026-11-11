'use client';
import { useEffect, useState } from 'react';
import { Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { QueryState } from '@/components/common/query-state';
import { useParams } from 'next/navigation';
import { SettingsSection, SettingsShell } from '@/features/settings/shared';
import { RefreshIconButton } from '@/features/shared/refresh-icon-button';
type Overview = {
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
   useEffect(() => {
      let active = true;
      setData(undefined);
      setError(undefined);
      void (async () => {
         try {
            const ws = await loadCurrentWorkspace();
            const overview = await responseData<Overview>(
               await authenticatedFetch(
                  `${api}/ai-operations?${new URLSearchParams({ workspaceId: ws.id })}`
               )
            );
            if (active) setData(overview);
         } catch (reason) {
            if (active)
               setError(
                  reason instanceof Error ? reason.message : 'Could not load AI provider usage.'
               );
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
            title="AI provider usage"
            description="Calls Flowie made to AI providers for its own features, with tokens and failures. MCP tool calls are in MCP logs; tool call limits are on the Integrations page."
            action={
               <RefreshIconButton label="Refresh usage" onClick={() => setRefresh((n) => n + 1)} />
            }
         >
            {error && <QueryState message={error} />}
            {!data && !error && <Text role="status">Loading usage…</Text>}
            {data && (
               <>
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
               </>
            )}
         </SettingsShell>
      </DesignSurface>
   );
}

/**
 * Bordered list of one-line rows (name left, measurements right) used by every AI provider
 * usage section; the right part wraps under the name on narrow screens. `alert` marks a row that
 * has errors so it stands out without changing its text.
 * VI: Danh sách có viền gồm các hàng một dòng (tên bên trái, số liệu bên phải) dùng cho mọi mục
 * VI: AI provider usage; phần bên phải xuống dưới tên ở màn hình hẹp. `alert` đánh dấu hàng có lỗi để
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
