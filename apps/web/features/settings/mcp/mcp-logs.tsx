'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Card } from '@astryxdesign/core/Card';
import { ClickableCard } from '@astryxdesign/core/ClickableCard';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import {
   Table,
   pixel,
   proportional,
   useTableSortable,
   useTableSortableState,
   type TableColumn,
} from '@astryxdesign/core/Table';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { SettingsShell } from '@/features/settings/shared';
import {
   getMcpAuditErrors,
   getMcpAuditSummary,
   listMcpConnections,
   type McpAuditSummary,
   type McpAuditWindow,
   type McpConnection,
   type McpErrorGroup,
} from '@/lib/mcp';
import { relativeTime } from '@/lib/time';
import { loadCurrentWorkspaceMembership } from '@/lib/workspaces';
import { ALL, DENIED_LABEL, McpActivity, type ErrorFilter } from './mcp-activity';

type ToolRow = McpAuditSummary['tools'][number];

const percent = (part: number, total: number) =>
   total ? ` (${Math.round((part / total) * 100)}%)` : '';

const counts = (row: { calls: number; failed: number; denied: number }) =>
   `${row.calls} calls · ${row.failed} failed · ${row.denied} not found / no access`;

const ms = (value: number | null) => (value == null ? '—' : `${Math.round(value)} ms`);

const kb = (bytes: number | null) => (bytes == null ? '—' : (bytes / 1024).toFixed(1));

const message = (cause: unknown, fallback: string) =>
   cause instanceof Error ? cause.message : fallback;

/**
 * Settings → MCP logs, the only place that reports MCP tool calls. For the chosen window it
 * shows tiles (Calls, Failed, Not found / no access, p95), Top errors, a sortable By tool
 * table and By connection above the call log. Every count comes from the same API scope as
 * the log (administrators: all connections; members: their own), and clicking a tile, an
 * error group, a tool or a connection sets the matching call-log filter, so the filtered log
 * holds exactly the calls that were counted.
 * VI: Settings → MCP logs, nơi duy nhất báo cáo lời gọi tool MCP. Với khoảng thời gian đã
 * VI: chọn, trang hiện các ô (Calls, Failed, Not found / no access, p95), Top errors, bảng By
 * VI: tool sắp xếp được và By connection phía trên Call log. Mọi số liệu dùng cùng phạm vi API
 * VI: với log (quản trị viên: mọi kết nối; thành viên: kết nối của mình), và bấm một ô, một
 * VI: nhóm lỗi, một tool hay một kết nối sẽ đặt bộ lọc Call log tương ứng, nên log sau khi lọc
 * VI: chứa đúng các lời gọi đã được đếm.
 */
export function McpLogs() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [connections, setConnections] = useState<McpConnection[]>([]);
   const [timeWindow, setTimeWindow] = useState<McpAuditWindow>('24h');
   const [summary, setSummary] = useState<McpAuditSummary>();
   const [errors, setErrors] = useState<McpErrorGroup[]>();
   const [connectionId, setConnectionId] = useState(ALL);
   const [tool, setTool] = useState(ALL);
   const [outcome, setOutcome] = useState(ALL);
   const [errorFilter, setErrorFilter] = useState<ErrorFilter>();
   const [error, setError] = useState<string>();
   const [reload, setReload] = useState(0);

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
            if (current) setError(message(cause, 'Could not load MCP logs.'));
         });
      return () => {
         current = false;
      };
   }, [reload]);

   useEffect(() => {
      if (!workspaceId) return;
      let current = true;
      setSummary(undefined);
      setErrors(undefined);
      setError(undefined);
      void Promise.all([
         getMcpAuditSummary(workspaceId, timeWindow),
         getMcpAuditErrors(workspaceId, timeWindow),
      ])
         .then(([data, groups]) => {
            if (!current) return;
            setSummary(data);
            setErrors(groups);
         })
         .catch((cause: unknown) => {
            if (current) setError(message(cause, 'Could not load the dashboard.'));
         });
      return () => {
         current = false;
      };
   }, [workspaceId, timeWindow, reload]);

   // A tile, a tool or the outcome control replaces any Top errors group filter, so the log
   // never combines a group with a filter that excludes it.
   // VI: Ô số liệu, tool hay bộ chọn kết quả thay thế bộ lọc nhóm Top errors, để log không
   // VI: bao giờ kết hợp một nhóm với bộ lọc loại trừ nó.
   const chooseOutcome = (value: string) => {
      setOutcome(value);
      setErrorFilter(undefined);
   };
   const chooseTool = (value: string) => {
      setTool(value);
      setErrorFilter(undefined);
   };
   const chooseGroup = (group: McpErrorGroup) => {
      setTool(group.tool);
      setOutcome(group.outcome);
      setErrorFilter({ statusCode: group.statusCode, message: group.message });
   };

   const totals = summary?.totals;
   const tiles: { label: string; value: string; outcome?: string }[] = totals
      ? [
           { label: 'Calls', value: String(totals.calls), outcome: ALL },
           {
              label: 'Failed',
              value: `${totals.failed}${percent(totals.failed, totals.calls)}`,
              outcome: 'failed',
           },
           {
              label: DENIED_LABEL,
              value: `${totals.denied}${percent(totals.denied, totals.calls)}`,
              outcome: 'denied',
           },
           { label: 'p95', value: ms(totals.p95Ms) },
        ]
      : [];

   return (
      <DesignSurface>
         <SettingsShell
            title="MCP logs"
            description="Tool calls made by AI clients through MCP: which tools fail, why, and who called them. Administrators see every connection; members see their own."
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
            {error && (
               <HStack gap={3} vAlign="center" wrap="wrap">
                  <Text role="alert">{error}</Text>
                  <Button
                     label="Retry"
                     size="sm"
                     variant="secondary"
                     onClick={() => setReload((n) => n + 1)}
                  />
               </HStack>
            )}
            {!summary && !error && <Text role="status">Loading dashboard…</Text>}
            {summary && (
               <VStack gap={5}>
                  <Grid columns={{ minWidth: 150, max: 4 }} gap={3} width="100%">
                     {tiles.map((tile) => {
                        const body = (
                           <VStack gap={2} role="group" aria-label={tile.label}>
                              <Text color="secondary">{tile.label}</Text>
                              <Text size="2xl" weight="semibold" hasTabularNumbers>
                                 {tile.value}
                              </Text>
                           </VStack>
                        );
                        if (!tile.outcome) return <Card key={tile.label}>{body}</Card>;
                        const active = outcome === tile.outcome && !errorFilter;
                        return (
                           <ClickableCard
                              key={tile.label}
                              label={
                                 tile.outcome === ALL
                                    ? 'Show all calls'
                                    : `Show ${tile.label.toLowerCase()} calls`
                              }
                              variant={active ? 'blue' : 'default'}
                              onClick={() => chooseOutcome(tile.outcome!)}
                           >
                              {body}
                           </ClickableCard>
                        );
                     })}
                  </Grid>
                  <TopErrors
                     groups={errors ?? []}
                     selected={errorFilter && { tool, ...errorFilter }}
                     onSelect={chooseGroup}
                  />
                  <ToolTable
                     rows={summary.tools}
                     selected={tool}
                     onSelect={(name) => chooseTool(tool === name ? ALL : name)}
                  />
                  <VStack gap={2} className="min-w-0" role="region" aria-label="By connection">
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
                  onToolChange={chooseTool}
                  outcome={outcome}
                  onOutcomeChange={chooseOutcome}
                  errorFilter={errorFilter}
                  onClearErrorFilter={() => setErrorFilter(undefined)}
               />
            )}
         </SettingsShell>
      </DesignSurface>
   );
}

/**
 * Unsuccessful calls grouped by tool, HTTP status, outcome and normalized message (ids,
 * dates and numbers replaced by the API), most frequent first. Selecting a group filters the
 * call log to its calls.
 * VI: Lời gọi không thành công gom theo tool, mã HTTP, kết quả và thông báo đã chuẩn hoá (API
 * VI: đã thay id, ngày và số), nhiều nhất trước. Chọn một nhóm lọc Call log theo nhóm đó.
 */
function TopErrors({
   groups,
   selected,
   onSelect,
}: {
   groups: McpErrorGroup[];
   selected?: { tool: string } & ErrorFilter;
   onSelect: (group: McpErrorGroup) => void;
}) {
   return (
      <VStack gap={2} className="min-w-0" role="region" aria-label="Top errors">
         <Heading level={2}>Top errors</Heading>
         <List hasDividers>
            {groups.map((group) => (
               <ListItem
                  key={`${group.tool}|${group.statusCode}|${group.outcome}|${group.message}`}
                  label={`${group.tool}${group.statusCode == null ? '' : ` · ${group.statusCode}`}`}
                  isSelected={
                     selected?.tool === group.tool &&
                     selected.statusCode === group.statusCode &&
                     selected.message === group.message
                  }
                  onClick={() => onSelect(group)}
                  startContent={
                     <StatusDot
                        variant={group.outcome === 'denied' ? 'warning' : 'error'}
                        label={group.outcome === 'denied' ? DENIED_LABEL : 'Failed'}
                     />
                  }
                  description={
                     <Text type="supporting" color="secondary" className="break-words">
                        {group.message || 'No message'} ·{' '}
                        {group.connections === 1
                           ? '1 connection'
                           : `${group.connections} connections`}{' '}
                        · last {relativeTime(group.lastAt)}
                     </Text>
                  }
                  endContent={<Badge label={String(group.count)} />}
               />
            ))}
         </List>
         {!groups.length && <Text color="secondary">No failed calls in this window.</Text>}
      </VStack>
   );
}

/**
 * Per-tool counts as a sortable table (calls descending until a header is clicked). The tool
 * name is a toggle button that filters the call log; the table scrolls inside its own frame
 * on narrow screens.
 * VI: Số liệu theo tool dạng bảng sắp xếp được (mặc định calls giảm dần cho tới khi bấm tiêu
 * VI: đề). Tên tool là nút bật/tắt lọc Call log; màn hình hẹp thì bảng cuộn trong khung riêng.
 */
function ToolTable({
   rows,
   selected,
   onSelect,
}: {
   rows: ToolRow[];
   selected: string;
   onSelect: (tool: string) => void;
}) {
   const { sortedData, sortConfig } = useTableSortableState<ToolRow, string>({
      data: rows,
      defaultSort: [{ sortKey: 'calls', direction: 'descending' }],
   });
   const sortPlugin = useTableSortable<ToolRow>(sortConfig);
   const number = (
      key: keyof ToolRow,
      header: string,
      format: (value: number) => string = String,
      width = 78
   ): TableColumn<ToolRow> => ({
      key,
      header,
      width: pixel(width),
      align: 'end',
      sortable: true,
      renderCell: (row) => {
         const value = row[key];
         return typeof value === 'number' ? format(value) : '—';
      },
   });
   const columns: TableColumn<ToolRow>[] = [
      {
         key: 'tool',
         header: 'Tool',
         width: proportional(1),
         sortable: true,
         renderCell: (row) => (
            <Button
               label={row.tool}
               size="sm"
               variant={selected === row.tool ? 'secondary' : 'ghost'}
               aria-pressed={selected === row.tool}
               onClick={() => onSelect(row.tool)}
            />
         ),
      },
      number('calls', 'Calls'),
      number('failed', 'Failed'),
      number('denied', DENIED_LABEL, String, 150),
      number('p95Ms', 'p95', ms),
      number('avgResultBytes', 'Avg KB', kb),
      number('totalResultBytes', 'Total KB', kb),
   ];
   return (
      <VStack gap={2} className="min-w-0" role="region" aria-label="By tool">
         <Heading level={2}>By tool</Heading>
         {rows.length ? (
            <Table
               data={sortedData}
               columns={columns}
               idKey="tool"
               density="compact"
               plugins={{ sort: sortPlugin }}
            />
         ) : (
            <Text color="secondary">No tool calls in this window.</Text>
         )}
      </VStack>
   );
}
