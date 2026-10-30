'use client';

import { useEffect, useState } from 'react';
import { Card } from '@astryxdesign/core/Card';
import { Grid } from '@astryxdesign/core/Grid';
import { VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { SettingsShell } from '@/components/common/settings/shared';
import {
   getMcpAuditSummary,
   listMcpConnections,
   type McpAuditSummary,
   type McpAuditWindow,
   type McpConnection,
} from '@/lib/mcp';
import { relativeTime } from '@/lib/time';
import { loadCurrentWorkspaceMembership } from '@/lib/workspaces';
import { ALL, McpActivity } from './mcp-activity';

const percent = (part: number, total: number) =>
   total ? ` (${Math.round((part / total) * 100)}%)` : '';

const counts = (row: { calls: number; failed: number; denied: number }) =>
   `${row.calls} calls · ${row.failed} failed · ${row.denied} denied`;

/**
 * Settings → MCP logs: a dashboard of MCP tool calls for the chosen window (totals, by tool,
 * by connection) above the call log. Selecting a dashboard row filters the log to that tool
 * or connection. The API scopes both to the workspace: administrators see every connection,
 * members only their own.
 * VI: Settings → MCP logs: dashboard lời gọi tool MCP theo khoảng thời gian đã chọn (tổng,
 * VI: theo tool, theo kết nối) phía trên danh sách log. Chọn một dòng dashboard sẽ lọc log
 * VI: theo tool hoặc kết nối đó. API giới hạn cả hai trong workspace: quản trị viên thấy mọi
 * VI: kết nối, thành viên chỉ thấy kết nối của mình.
 */
export function McpLogs() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [connections, setConnections] = useState<McpConnection[]>([]);
   const [timeWindow, setTimeWindow] = useState<McpAuditWindow>('24h');
   const [summary, setSummary] = useState<McpAuditSummary>();
   const [connectionId, setConnectionId] = useState(ALL);
   const [tool, setTool] = useState(ALL);
   const [error, setError] = useState<string>();

   useEffect(() => {
      let current = true;
      void loadCurrentWorkspaceMembership()
         .then(async ({ workspace }) => {
            const rows = await listMcpConnections(workspace.id);
            if (!current) return;
            setConnections(rows);
            setWorkspaceId(workspace.id);
         })
         .catch((cause: unknown) => {
            if (current)
               setError(cause instanceof Error ? cause.message : 'Could not load MCP logs.');
         });
      return () => {
         current = false;
      };
   }, []);

   useEffect(() => {
      if (!workspaceId) return;
      let current = true;
      void getMcpAuditSummary(workspaceId, timeWindow)
         .then((data) => current && setSummary(data))
         .catch((cause: unknown) => {
            if (current)
               setError(cause instanceof Error ? cause.message : 'Could not load the dashboard.');
         });
      return () => {
         current = false;
      };
   }, [workspaceId, timeWindow]);

   const totals = summary?.totals;
   const tiles: [string, string][] = totals
      ? [
           ['Calls', String(totals.calls)],
           ['Failed', `${totals.failed}${percent(totals.failed, totals.calls)}`],
           ['Denied', `${totals.denied}${percent(totals.denied, totals.calls)}`],
           ['p95', totals.p95Ms == null ? '—' : `${Math.round(totals.p95Ms)} ms`],
        ]
      : [];

   return (
      <DesignSurface>
         <SettingsShell
            title="MCP logs"
            description="Tool calls made by AI clients through MCP: who called which tool, and why a call failed. Administrators see every connection; members see their own."
            action={
               <SegmentedControl
                  label="Time window"
                  value={timeWindow}
                  onChange={(value) => setTimeWindow(value as McpAuditWindow)}
                  size="sm"
               >
                  <SegmentedControlItem value="24h" label="24 hours" />
                  <SegmentedControlItem value="7d" label="7 days" />
                  <SegmentedControlItem value="30d" label="30 days" />
               </SegmentedControl>
            }
         >
            {error && <Text role="alert">{error}</Text>}
            {summary && (
               <VStack gap={4}>
                  <Grid columns={{ minWidth: 150, max: 4 }} gap={3} width="100%">
                     {tiles.map(([label, value]) => (
                        <Card key={label} padding={4}>
                           <VStack gap={2} role="group" aria-label={label}>
                              <Text color="secondary">{label}</Text>
                              <Text size="2xl" weight="semibold" hasTabularNumbers>
                                 {value}
                              </Text>
                           </VStack>
                        </Card>
                     ))}
                  </Grid>
                  <Grid columns={{ minWidth: 300, max: 2 }} gap={5} width="100%">
                     <VStack gap={2} className="min-w-0">
                        <Heading level={2}>By tool</Heading>
                        <List hasDividers>
                           {summary.tools.map((row) => (
                              <ListItem
                                 key={row.tool}
                                 label={row.tool}
                                 isSelected={tool === row.tool}
                                 onClick={() => setTool(tool === row.tool ? ALL : row.tool)}
                                 description={
                                    <Text type="supporting" color="secondary">
                                       {counts(row)}
                                       {row.p95Ms != null && ` · p95 ${Math.round(row.p95Ms)} ms`}
                                    </Text>
                                 }
                              />
                           ))}
                        </List>
                        {!summary.tools.length && (
                           <Text color="secondary">No tool calls in this window.</Text>
                        )}
                     </VStack>
                     <VStack gap={2} className="min-w-0">
                        <Heading level={2}>By connection</Heading>
                        <List hasDividers>
                           {summary.connections.map((row) => {
                              const id = row.connectionId ?? '';
                              return (
                                 <ListItem
                                    key={id}
                                    label={row.connectionName ?? 'Removed connection'}
                                    isSelected={connectionId === id}
                                    onClick={() => setConnectionId(connectionId === id ? ALL : id)}
                                    description={
                                       <Text type="supporting" color="secondary">
                                          {row.ownerName && `${row.ownerName} · `}
                                          {counts(row)} · last {relativeTime(row.lastCallAt)}
                                       </Text>
                                    }
                                 />
                              );
                           })}
                        </List>
                        {!summary.connections.length && (
                           <Text color="secondary">No tool calls in this window.</Text>
                        )}
                     </VStack>
                  </Grid>
               </VStack>
            )}
            {workspaceId && (
               <McpActivity
                  workspaceId={workspaceId}
                  connections={connections}
                  tools={summary?.tools.map((row) => row.tool) ?? []}
                  timeWindow={timeWindow}
                  connectionId={connectionId}
                  onConnectionChange={setConnectionId}
                  tool={tool}
                  onToolChange={setTool}
               />
            )}
         </SettingsShell>
      </DesignSurface>
   );
}
