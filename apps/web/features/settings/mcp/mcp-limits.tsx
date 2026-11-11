'use client';

import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@astryxdesign/core/Button';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table';
import { Heading, Text } from '@astryxdesign/core/Text';
import { getMcpLimits, saveMcpLimits, type McpLimits } from '@/lib/mcp';
import { SuccessMark } from './success-mark';

const MAX_LIMIT = 10000;

type ToolLimit = { tool: string; limit: number | null };

/**
 * Owner/Admin form for the workspace's MCP tool-call budgets: one total per minute and an
 * optional per-tool limit for each registered tool (empty = only the total applies). Values
 * are whole numbers from 1 to 10,000, which the API checks again. Calls over a budget get
 * 429 from the MCP endpoint.
 * VI: Form (Owner/Admin) đặt giới hạn lời gọi tool MCP của workspace: một tổng mỗi phút và
 * VI: giới hạn riêng tuỳ chọn cho từng tool đã đăng ký (để trống = chỉ áp dụng tổng). Giá
 * VI: trị là số nguyên 1–10.000, API kiểm tra lại. Lời gọi vượt giới hạn nhận 429 từ MCP.
 */
export function McpLimitsForm({ workspaceId }: { workspaceId: string }) {
   const [current, setCurrent] = useState<McpLimits>();
   const [total, setTotal] = useState<number | null>(null);
   const [perTool, setPerTool] = useState<Record<string, number>>({});
   const [busy, setBusy] = useState(false);
   const [saved, setSaved] = useState(false);

   useEffect(() => {
      let cancelled = false;
      void getMcpLimits(workspaceId)
         .then((next) => {
            if (cancelled) return;
            setCurrent(next);
            setTotal(next.totalPerMinute);
            setPerTool(next.perTool);
         })
         .catch((cause: unknown) =>
            toast.error(cause instanceof Error ? cause.message : 'Could not load limits.')
         );
      return () => {
         cancelled = true;
      };
   }, [workspaceId]);

   if (!current) return null;

   const setTool = (tool: string, value: number | null) =>
      setPerTool((limits) => {
         const next = { ...limits };
         if (value == null) delete next[tool];
         else next[tool] = value;
         return next;
      });

   async function save() {
      if (total == null) return;
      setBusy(true);
      setSaved(false);
      try {
         await saveMcpLimits(workspaceId, { totalPerMinute: total, perTool });
         setCurrent((value) => value && { ...value, totalPerMinute: total, perTool });
         setSaved(true);
         toast.success('Limits saved.');
      } catch (cause) {
         toast.error(cause instanceof Error ? cause.message : 'Could not save limits.');
      } finally {
         setBusy(false);
      }
   }

   const rows: ToolLimit[] = current.tools.map((tool) => ({ tool, limit: perTool[tool] ?? null }));
   const columns: TableColumn<ToolLimit>[] = [
      { key: 'tool', header: 'Tool', width: proportional(1) },
      {
         key: 'limit',
         header: 'Limit per minute',
         width: pixel(180),
         renderCell: (row) => (
            <NumberInput
               label={`${row.tool} limit per minute`}
               isLabelHidden
               size="sm"
               value={row.limit}
               placeholder="Total only"
               min={1}
               max={MAX_LIMIT}
               isIntegerOnly
               hasClear
               onChange={(value: number | null) => setTool(row.tool, value)}
            />
         ),
      },
   ];
   const custom = Object.keys(perTool).length;

   return (
      <VStack gap={3}>
         <Heading level={3}>Tool call limits</Heading>
         <Text color="secondary">
            {current.usage} / {current.totalPerMinute} tool calls this minute. Calls over a limit
            are refused with 429 until the next minute.
         </Text>
         <NumberInput
            label="Calls per minute (workspace)"
            width={240}
            value={total}
            min={1}
            max={MAX_LIMIT}
            isIntegerOnly
            onChange={setTotal}
         />
         <Collapsible defaultIsOpen={false} trigger={`Per-tool limits (${custom} set)`}>
            <Table data={rows} columns={columns} idKey="tool" density="compact" />
         </Collapsible>
         <HStack gap={2} vAlign="center">
            <Button
               label="Save limits"
               size="sm"
               icon={<Save className="size-4" />}
               isLoading={busy}
               isDisabled={total == null}
               onClick={() => void save()}
            />
            {saved && <SuccessMark label="Limits saved" />}
         </HStack>
      </VStack>
   );
}
