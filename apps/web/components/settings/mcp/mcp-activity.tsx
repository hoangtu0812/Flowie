'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, List as ListIcon } from 'lucide-react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { List, ListItem } from '@astryxdesign/core/List';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import {
   listMcpAudit,
   type McpAudit,
   type McpAuditFilter,
   type McpAuditWindow,
   type McpConnection,
} from '@/lib/mcp';
import { parseInstant, relativeTime } from '@/lib/time';
import { describeAuditEvent } from './audit-event';

export const ALL = 'all';
const DOT = { succeeded: 'success', failed: 'error', denied: 'warning' } as const;

/**
 * Pages MCP log events newest first, filtered by time window, connection, tool and outcome,
 * so failed and denied calls can be found without scrolling through every successful read.
 * Connection and tool are owned by the MCP logs page so its dashboard rows can set them.
 * Selecting an event opens its details: caller, error and the masked arguments the server
 * stored for failed calls (rendered as text, never as HTML).
 * VI: Phân trang sự kiện log MCP mới nhất trước, lọc theo khoảng thời gian, kết nối, tool và
 * VI: kết quả, để tìm lời gọi lỗi hoặc bị từ chối mà không phải cuộn qua mọi lần đọc thành
 * VI: công. Kết nối và tool do trang MCP logs giữ để các dòng dashboard đặt được bộ lọc. Chọn
 * VI: một sự kiện mở chi tiết: người gọi, lỗi và tham số đã che mà server lưu cho lời gọi lỗi
 * VI: (hiển thị dạng văn bản, không render HTML).
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
}: {
   workspaceId: string;
   connections: McpConnection[];
   tools: string[];
   timeWindow: McpAuditWindow;
   connectionId: string;
   onConnectionChange: (value: string) => void;
   tool: string;
   onToolChange: (value: string) => void;
}) {
   const [outcome, setOutcome] = useState(ALL);
   const [events, setEvents] = useState<McpAudit[]>([]);
   const [cursor, setCursor] = useState<string | null>(null);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string>();
   const [selected, setSelected] = useState<McpAudit>();

   const filter: McpAuditFilter = {
      connectionId: connectionId === ALL ? undefined : connectionId,
      outcome: outcome === ALL ? undefined : (outcome as McpAuditFilter['outcome']),
      tool: tool === ALL ? undefined : tool,
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
         } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'Could not load activity.');
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
      <VStack gap={3}>
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
            <SegmentedControl label="Outcome" value={outcome} onChange={setOutcome} size="sm">
               <SegmentedControlItem value={ALL} label="All" icon={<ListIcon size={14} />} />
               <SegmentedControlItem
                  value="succeeded"
                  label="Succeeded"
                  icon={<CircleCheck size={14} />}
               />
               <SegmentedControlItem
                  value="failed"
                  label="Failed or denied"
                  icon={<CircleAlert size={14} />}
               />
            </SegmentedControl>
         </HStack>
         {error && <Text role="alert">{error}</Text>}
         <List hasDividers>
            {events.map((event) => {
               const { label, outcome: result } = describeAuditEvent(event.action);
               const at = parseInstant(event.createdAt);
               const { statusCode, message, durationMs } = event.metadata;
               return (
                  <ListItem
                     key={event.id}
                     label={label}
                     onClick={() => setSelected(event)}
                     startContent={
                        <StatusDot
                           variant={result ? DOT[result] : 'neutral'}
                           label={result ?? 'Configuration change'}
                        />
                     }
                     description={
                        <Text type="supporting" color="secondary">
                           {event.connectionName ?? 'Removed connection'}
                           {event.actorName && ` · ${event.actorName}`} ·{' '}
                           <time dateTime={at.toISOString()} title={at.toLocaleString()}>
                              {relativeTime(event.createdAt)}
                           </time>
                           {durationMs != null && ` · ${durationMs} ms`}
                           {statusCode != null && ` · ${statusCode} ${message ?? ''}`}
                        </Text>
                     }
                     endContent={
                        result && result !== 'succeeded' ? (
                           <Text type="supporting">
                              {result === 'denied' ? 'Denied' : 'Failed'}
                           </Text>
                        ) : undefined
                     }
                  />
               );
            })}
         </List>
         {!loading && !events.length && !error && (
            <Text color="secondary">No activity matches these filters.</Text>
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
         <Dialog
            isOpen={!!selected}
            onOpenChange={(open) => !open && setSelected(undefined)}
            purpose="info"
            padding={5}
            width={640}
         >
            <VStack gap={4}>
               <DialogHeader
                  title="Call details"
                  onOpenChange={(open) => !open && setSelected(undefined)}
               />
               {selected && <CallDetails event={selected} />}
            </VStack>
         </Dialog>
      </VStack>
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
      ['Outcome', outcome ?? 'Configuration change'],
      ['Status code', meta.statusCode],
      ['Error', meta.error],
      ['Message', meta.message],
      ['Duration', meta.durationMs != null ? `${meta.durationMs} ms` : undefined],
      ['Correlation id', meta.correlationId],
   ];
   return (
      <VStack gap={3}>
         <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            {rows
               .filter(([, value]) => value != null && value !== '')
               .map(([name, value]) => (
                  <div key={name} className="contents">
                     <dt className="text-muted-foreground">{name}</dt>
                     <dd className="break-words">{value}</dd>
                  </div>
               ))}
         </dl>
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
