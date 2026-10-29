'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleAlert, CircleCheck, List as ListIcon } from 'lucide-react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { List, ListItem } from '@astryxdesign/core/List';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { listMcpAudit, type McpAudit, type McpAuditFilter, type McpConnection } from '@/lib/mcp';
import { parseInstant, relativeTime } from '@/lib/time';
import { describeAuditEvent } from './audit-event';

const ALL = 'all';
const DOT = { succeeded: 'success', failed: 'error', denied: 'warning' } as const;

/**
 * Pages MCP audit events newest first, filtered by connection and outcome, so failed
 * and denied calls can be found without scrolling through every successful read.
 * VI: Phân trang sự kiện audit MCP mới nhất trước, lọc theo kết nối và kết quả, để tìm
 * VI: lời gọi lỗi hoặc bị từ chối mà không phải cuộn qua mọi lần đọc thành công.
 */
export function McpActivity({
   workspaceId,
   connections,
}: {
   workspaceId: string;
   connections: McpConnection[];
}) {
   const [connectionId, setConnectionId] = useState(ALL);
   const [outcome, setOutcome] = useState(ALL);
   const [events, setEvents] = useState<McpAudit[]>([]);
   const [cursor, setCursor] = useState<string | null>(null);
   const [loading, setLoading] = useState(false);
   const [error, setError] = useState<string>();

   const filter: McpAuditFilter = {
      connectionId: connectionId === ALL ? undefined : connectionId,
      outcome: outcome === ALL ? undefined : (outcome as McpAuditFilter['outcome']),
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

   // Connection changes (create, edit, revoke) add audit events, so the first page reloads.
   // VI: Thay đổi kết nối (tạo, sửa, thu hồi) sinh sự kiện audit, nên tải lại trang đầu.
   useEffect(() => {
      void load();
   }, [load, connections]);

   return (
      <VStack gap={3}>
         <Heading level={3}>Recent activity</Heading>
         <HStack gap={3} vAlign="end" wrap="wrap">
            <Selector
               label="Connection"
               value={connectionId}
               onChange={setConnectionId}
               hasSearch
               options={[
                  { value: ALL, label: 'All connections' },
                  ...connections.map((connection) => ({
                     value: connection.id,
                     label: connection.name,
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
               return (
                  <ListItem
                     key={event.id}
                     label={label}
                     startContent={
                        <StatusDot
                           variant={result ? DOT[result] : 'neutral'}
                           label={result ?? 'Configuration change'}
                        />
                     }
                     description={
                        <Text type="supporting" color="secondary">
                           {event.connectionName ?? 'Removed connection'} ·{' '}
                           <time dateTime={at.toISOString()} title={at.toLocaleString()}>
                              {relativeTime(event.createdAt)}
                           </time>
                           {event.metadata.durationMs != null &&
                              ` · ${event.metadata.durationMs} ms`}
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
      </VStack>
   );
}
