'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, List as ListIcon, ShieldQuestion } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible, CollapsibleGroup } from '@astryxdesign/core/Collapsible';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { MetadataList, MetadataListItem } from '@astryxdesign/core/MetadataList';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import {
   listMcpAudit,
   type McpAudit,
   type McpAuditFilter,
   type McpAuditOutcome,
   type McpAuditWindow,
   type McpConnection,
} from '@/lib/mcp';
import { parseInstant, relativeTime } from '@/lib/time';
import { describeAuditEvent } from './audit-event';

export const ALL = 'all';

/** Label of the `denied` outcome: 401/403, or a record outside the connection's scope. */
/** VI: Nhãn của outcome `denied`: 401/403, hoặc bản ghi ngoài phạm vi kết nối. */
export const DENIED_LABEL = 'Not found / no access';

/** A Top errors group selected as a call-log filter (status and normalized message). */
/** VI: Nhóm Top errors được chọn làm bộ lọc Call log (mã và thông báo đã chuẩn hoá). */
export type ErrorFilter = { statusCode: number | null; message: string };

const DOT = { succeeded: 'success', failed: 'error', denied: 'warning' } as const;
const OUTCOME_LABEL = { succeeded: 'Succeeded', failed: 'Failed', denied: DENIED_LABEL } as const;

/**
 * The MCP call log: events newest first, paged 20 at a time, filtered by the page's time
 * window, connection, tool, outcome and optionally one Top errors group. The filters are
 * owned by the MCP logs page so its tiles and tables can set them. Each row expands in place
 * to show the call's details, including the masked arguments the server stored for
 * unsuccessful calls (rendered as text, never as HTML).
 * VI: Call log MCP: sự kiện mới nhất trước, mỗi lần 20 dòng, lọc theo khoảng thời gian của
 * VI: trang, kết nối, tool, kết quả và có thể một nhóm Top errors. Bộ lọc do trang MCP logs
 * VI: giữ để các ô số liệu và bảng đặt được. Mỗi dòng mở rộng tại chỗ để xem chi tiết lời
 * VI: gọi, kể cả tham số đã che mà server lưu cho lời gọi không thành công (hiển thị dạng văn
 * VI: bản, không render HTML).
 */
export function McpActivity({
   workspaceId,
   connections,
   tools,
   timeWindow,
   connectionId,
   onConnectionChange,
   tool,
   onToolChange,
   outcome,
   onOutcomeChange,
   errorFilter,
   onClearErrorFilter,
}: {
   workspaceId: string;
   connections: McpConnection[];
   tools: string[];
   timeWindow: McpAuditWindow;
   connectionId: string;
   onConnectionChange: (value: string) => void;
   tool: string;
   onToolChange: (value: string) => void;
   outcome: string;
   onOutcomeChange: (value: string) => void;
   errorFilter?: ErrorFilter;
   onClearErrorFilter: () => void;
}) {
   const [events, setEvents] = useState<McpAudit[]>([]);
   const [cursor, setCursor] = useState<string | null>(null);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string>();
   const [open, setOpen] = useState<string[]>([]);

   const filter: McpAuditFilter = {
      connectionId: connectionId === ALL ? undefined : connectionId,
      outcome: outcome === ALL ? undefined : (outcome as McpAuditOutcome),
      tool: tool === ALL ? undefined : tool,
      statusCode: errorFilter?.statusCode ?? undefined,
      message: errorFilter?.message || undefined,
      window: timeWindow,
   };
   const filterKey = JSON.stringify(filter);

   const load = useCallback(
      async (after?: string) => {
         setLoading(true);
         setError(undefined);
         try {
            const page = await listMcpAudit(workspaceId, JSON.parse(filterKey), after);
            setEvents((current) => (after ? [...current, ...page.items] : page.items));
            setCursor(page.nextCursor);
            if (!after) setOpen([]);
         } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not load the call log.');
         } finally {
            setLoading(false);
         }
      },
      [workspaceId, filterKey]
   );

   useEffect(() => {
      void load();
   }, [load]);

   return (
      <VStack gap={3} role="region" aria-label="Call log">
         <Heading level={2}>Call log</Heading>
         <HStack gap={3} vAlign="end" wrap="wrap">
            <Selector
               label="Connection"
               value={connectionId}
               onChange={onConnectionChange}
               hasSearch
               options={[
                  { value: ALL, label: 'All connections' },
                  ...connections.map((connection) => ({
                     value: connection.id,
                     label: connection.name,
                  })),
               ]}
            />
            <Selector
               label="Tool"
               value={tool}
               onChange={onToolChange}
               hasSearch
               options={[
                  { value: ALL, label: 'All tools' },
                  ...[...new Set([...tools, ...(tool === ALL ? [] : [tool])])].map((name) => ({
                     value: name,
                     label: name,
                  })),
               ]}
            />
            <SegmentedControl label="Outcome" value={outcome} onChange={onOutcomeChange} size="sm">
               <SegmentedControlItem value={ALL} label="All" icon={<ListIcon size={14} />} />
               <SegmentedControlItem
                  value="succeeded"
                  label="Succeeded"
                  icon={<CircleCheck size={14} />}
               />
               <SegmentedControlItem
                  value="failed"
                  label="Failed"
                  icon={<CircleAlert size={14} />}
               />
               <SegmentedControlItem
                  value="denied"
                  label={DENIED_LABEL}
                  icon={<ShieldQuestion size={14} />}
               />
            </SegmentedControl>
         </HStack>
         {errorFilter && (
            <HStack>
               <Token
                  label={`Filtered by error: ${errorFilter.statusCode ?? ''} ${errorFilter.message}`.trim()}
                  onRemove={onClearErrorFilter}
               />
            </HStack>
         )}
         {error && (
            <HStack gap={3} vAlign="center" wrap="wrap">
               <Text role="alert">{error}</Text>
               <Button label="Retry" size="sm" variant="secondary" onClick={() => void load()} />
            </HStack>
         )}
         {loading && !events.length && <Text role="status">Loading calls…</Text>}
         <CollapsibleGroup
            type="multiple"
            hasDividers
            density="compact"
            value={open}
            onChange={(value) => setOpen(Array.isArray(value) ? value : [value])}
         >
            {events.map((event) => (
               <Collapsible key={event.id} value={event.id} trigger={<CallRow event={event} />}>
                  <CallDetails event={event} />
               </Collapsible>
            ))}
         </CollapsibleGroup>
         {!loading && !events.length && !error && (
            <Text color="secondary">No calls match these filters.</Text>
         )}
         {cursor && (
            <HStack>
               <Button
                  label="Load more"
                  variant="secondary"
                  size="sm"
                  isLoading={loading}
                  onClick={() => void load(cursor)}
               />
            </HStack>
         )}
      </VStack>
   );
}

/** One collapsed call-log row: status dot, tool label, caller, time, duration and status. */
/** VI: Một dòng Call log thu gọn: chấm trạng thái, tên tool, người gọi, giờ, thời lượng, mã. */
function CallRow({ event }: { event: McpAudit }) {
   const { label, outcome } = describeAuditEvent(event.action);
   const at = parseInstant(event.createdAt);
   const { statusCode, message, durationMs } = event.metadata;
   return (
      <HStack gap={3} vAlign="center" className="min-w-0">
         <StatusDot
            variant={outcome ? DOT[outcome] : 'neutral'}
            label={outcome ? OUTCOME_LABEL[outcome] : 'Configuration change'}
         />
         <VStack gap={0.5} className="min-w-0">
            <Text weight="semibold">
               {label}
               {statusCode != null && ` · ${statusCode}`}
            </Text>
            <Text type="supporting" color="secondary" className="break-words">
               {event.connectionName ?? 'Removed connection'}
               {event.actorName && ` · ${event.actorName}`} ·{' '}
               <time dateTime={at.toISOString()} title={at.toLocaleString()}>
                  {relativeTime(event.createdAt)}
               </time>
               {durationMs != null && ` · ${durationMs} ms`}
               {message && ` · ${message}`}
            </Text>
         </VStack>
      </HStack>
   );
}

function CallDetails({ event }: { event: McpAudit }) {
   const { label, outcome } = describeAuditEvent(event.action);
   const meta = event.metadata;
   const rows: [string, string | number | undefined | null][] = [
      ['Time', parseInstant(event.createdAt).toLocaleString()],
      ['Caller', event.actorName],
      ['Connection', event.connectionName ?? 'Removed connection'],
      ['Tool', meta.tool ?? label],
      ['Outcome', outcome ? OUTCOME_LABEL[outcome] : 'Configuration change'],
      ['HTTP status', meta.statusCode],
      ['Error', meta.error],
      ['Message', meta.message],
      ['Duration', meta.durationMs != null ? `${meta.durationMs} ms` : undefined],
      ['Correlation id', meta.correlationId],
   ];
   return (
      <VStack gap={3} aria-label="Call details">
         <MetadataList>
            {rows
               .filter(([, value]) => value != null && value !== '')
               .map(([name, value]) => (
                  <MetadataListItem key={name} label={name}>
                     <Text className="break-words">{String(value)}</Text>
                  </MetadataListItem>
               ))}
         </MetadataList>
         {meta.arguments !== undefined && (
            <VStack gap={1}>
               <Text weight="semibold">Arguments (masked)</Text>
               <pre
                  aria-label="Arguments"
                  className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-words"
               >
                  {JSON.stringify(meta.arguments, null, 2)}
               </pre>
            </VStack>
         )}
      </VStack>
   );
}
