'use client';

import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { Check, Pencil, Search, Trash2, X } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Pagination } from '@astryxdesign/core/Pagination';
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
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { parseInstant, relativeTime } from '@/lib/time';
import type { McpConnection } from '@/lib/mcp';

const PAGE_SIZE = 10;

type StatusFilter = 'active' | 'inactive' | 'all';

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export const isInactive = (connection: McpConnection) =>
   Boolean(connection.revokedAt) || parseInstant(connection.expiresAt).getTime() < Date.now();

type Props = {
   connections: McpConnection[];
   busy: boolean;
   enabled: boolean;
   createdId?: string;
   onEdit: (connection: McpConnection) => void;
   onRevoke: (id: string) => Promise<unknown>;
};

/**
 * Compact, client-side filtered table of the caller's MCP connections.
 * The API already returns every connection the caller may see (newest first), so search, the
 * Active/Inactive/All filter, column sorting and 10-row paging all run in the browser. Active is
 * the default filter: revoked and expired connections pile up over time and are rarely acted on.
 * The page resets to 1 when the search or filter changes and is clamped when a revoke shrinks
 * the list, so the table never shows an empty page while rows remain.
 * VI: Bảng gọn các kết nối MCP của người gọi, lọc trên trình duyệt.
 * VI: API đã trả mọi kết nối người gọi được xem (mới nhất trước), nên tìm kiếm, bộ lọc
 * VI: Active/Inactive/All, sắp xếp cột và phân trang 10 dòng đều chạy trên trình duyệt. Mặc định
 * VI: lọc Active: kết nối đã thu hồi và hết hạn dồn lại theo thời gian và hiếm khi cần thao tác.
 * VI: Trang về 1 khi đổi từ khoá hoặc bộ lọc và bị kẹp lại khi thu hồi làm danh sách ngắn đi,
 * VI: để bảng không hiện trang trống khi vẫn còn dòng.
 */
export function ConnectionsTable({
   connections,
   busy,
   enabled,
   createdId,
   onEdit,
   onRevoke,
}: Props) {
   const [query, setQuery] = useState('');
   const [status, setStatus] = useState<StatusFilter>('active');
   const [page, setPage] = useState(1);
   const [confirmRevokeId, setConfirmRevokeId] = useState<string>();

   const counts = useMemo(() => {
      const inactive = connections.filter(isInactive).length;
      return { active: connections.length - inactive, inactive, all: connections.length };
   }, [connections]);

   const filtered = useMemo(() => {
      const needle = query.trim().toLowerCase();
      return connections.filter(
         (connection) =>
            (status === 'all' || isInactive(connection) === (status === 'inactive')) &&
            (!needle || connection.name.toLowerCase().includes(needle))
      );
   }, [connections, query, status]);

   const { sortedData, sortConfig } = useTableSortableState({ data: filtered });
   const sortPlugin = useTableSortable<McpConnection>(sortConfig);
   const pageCount = Math.max(1, Math.ceil(sortedData.length / PAGE_SIZE));
   const currentPage = Math.min(page, pageCount);
   const rows = sortedData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

   const columns: TableColumn<McpConnection>[] = [
      {
         key: 'name',
         header: 'Name',
         width: proportional(2),
         sortable: true,
         renderCell: (connection) => {
            const inactive = isInactive(connection);
            const fresh = createdId === connection.id;
            return (
               <HStack gap={2} vAlign="center">
                  <motion.span
                     className="inline-flex"
                     initial={fresh ? { scale: 0 } : false}
                     animate={{ scale: 1 }}
                     transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                  >
                     <StatusDot
                        variant={inactive ? 'neutral' : 'success'}
                        label={inactive ? 'Inactive' : 'Active'}
                        isPulsing={fresh}
                     />
                  </motion.span>
                  <Text className="truncate">{connection.name}</Text>
               </HStack>
            );
         },
      },
      {
         key: 'expiresAt',
         header: 'Expires',
         width: proportional(1),
         sortable: true,
         renderCell: (connection) =>
            connection.revokedAt ? 'Revoked' : connection.expiresAt.slice(0, 10),
      },
      {
         key: 'lastUsedAt',
         header: 'Last used',
         width: proportional(1),
         sortable: true,
         renderCell: (connection) =>
            connection.lastUsedAt ? relativeTime(connection.lastUsedAt) : 'Never',
      },
      {
         key: 'access',
         header: 'Access',
         width: pixel(220),
         renderCell: (connection) =>
            `${plural(connection.scopes.length, 'permission')} · ${
               connection.projectIds.length
                  ? plural(connection.projectIds.length, 'project')
                  : 'All projects'
            }`,
      },
      {
         key: 'actions',
         header: <span className="sr-only">Actions</span>,
         width: pixel(112),
         align: 'end',
         renderCell: (connection) => {
            const inactive = isInactive(connection);
            return confirmRevokeId === connection.id ? (
               <HStack gap={1} hAlign="end">
                  <Button
                     label="Confirm revoke"
                     tooltip="Confirm revoke"
                     icon={<Check className="size-4" />}
                     isIconOnly
                     size="sm"
                     variant="destructive"
                     isLoading={busy}
                     onClick={() =>
                        void onRevoke(connection.id).then(() => setConfirmRevokeId(undefined))
                     }
                  />
                  <Button
                     label="Keep connection"
                     tooltip="Keep connection"
                     icon={<X className="size-4" />}
                     isIconOnly
                     size="sm"
                     variant="ghost"
                     onClick={() => setConfirmRevokeId(undefined)}
                  />
               </HStack>
            ) : (
               <HStack gap={1} hAlign="end">
                  {connection.ownedByCurrentUser && !inactive && (
                     <Button
                        label={`Edit ${connection.name}`}
                        tooltip="Edit permissions and projects"
                        icon={<Pencil className="size-4" />}
                        isIconOnly
                        size="sm"
                        variant="ghost"
                        isDisabled={busy || !enabled}
                        onClick={() => onEdit(connection)}
                     />
                  )}
                  <Button
                     label="Revoke connection"
                     tooltip="Revoke connection"
                     icon={<Trash2 className="size-4" />}
                     isIconOnly
                     size="sm"
                     variant="ghost"
                     isDisabled={inactive || busy}
                     onClick={() => setConfirmRevokeId(connection.id)}
                  />
               </HStack>
            );
         },
      },
   ];

   if (!connections.length) return null;

   return (
      <VStack gap={3}>
         <HStack gap={2} vAlign="end" hAlign="between" wrap="wrap">
            <TextInput
               label="Search connections"
               isLabelHidden
               placeholder="Search connections"
               startIcon={<Search className="size-4" />}
               value={query}
               onChange={(value) => {
                  setQuery(value);
                  setPage(1);
               }}
               hasClear
            />
            <SegmentedControl
               label="Connection status"
               value={status}
               onChange={(value) => {
                  setStatus(value as StatusFilter);
                  setPage(1);
               }}
               size="sm"
            >
               <SegmentedControlItem value="active" label={`Active (${counts.active})`} />
               <SegmentedControlItem value="inactive" label={`Inactive (${counts.inactive})`} />
               <SegmentedControlItem value="all" label={`All (${counts.all})`} />
            </SegmentedControl>
         </HStack>
         {rows.length ? (
            // The table keeps its column minimums and scrolls sideways on narrow screens
            // instead of widening the page; `relative` keeps the visually hidden Actions
            // header (absolutely positioned) inside this box.
            // VI: Bảng giữ độ rộng tối thiểu của cột và cuộn ngang trên màn hình hẹp thay vì
            // VI: làm trang rộng ra; `relative` giữ tiêu đề Actions ẩn (định vị tuyệt đối)
            // VI: nằm trong khung này.
            <VStack className="relative w-full min-w-0 overflow-x-auto">
               <Table
                  data={rows}
                  columns={columns}
                  idKey="id"
                  density="compact"
                  hasHover
                  textOverflow="truncate"
                  plugins={{ sort: sortPlugin }}
               />
            </VStack>
         ) : (
            <Text color="secondary">No connections match.</Text>
         )}
         {sortedData.length > PAGE_SIZE && (
            <Pagination
               label="Connection pages"
               page={currentPage}
               onChange={setPage}
               totalItems={sortedData.length}
               pageSize={PAGE_SIZE}
               size="sm"
            />
         )}
      </VStack>
   );
}
