'use client';

import { DataTableFilter } from '@/components/data-table-filter';
import { useDataTableFilters } from '@/components/data-table-filter/hooks/use-data-table-filters';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { useMemo } from 'react';
import { createIssueFilterColumns } from './issue-filter-columns';

/**
 * Linear-style applied-filters row: filter chips (subject / operator /
 * values / remove), an icon button to add more filters and a Clear action,
 * powered by bazza/ui's data-table-filter. Filter state lives in the URL
 * (see filter-store).
 *
 * The row only appears once at least one filter is active — the entry
 * point "Filter" button lives in the header toolbar (see
 * <IssueFilterTrigger/>), like Linear.
 */
export function IssueFilterBar() {
   const { issues, members, projects, statuses, labels, cycles } = useIssuesStore();
   const { filters, setFilters } = useFilterStore();
   const columnsConfig = useMemo(
      () => createIssueFilterColumns({ members, projects, statuses, labels, cycles }),
      [members, projects, statuses, labels, cycles]
   );

   const { columns, actions, strategy } = useDataTableFilters({
      // The API already filtered `issues` and loads them in pages, so counts
      // computed from them would be wrong; 'server' shows options without counts.
      // VI: API đã lọc `issues` và tải theo trang nên số đếm tính từ đó sẽ sai;
      // 'server' hiển thị lựa chọn mà không có số đếm.
      strategy: 'server',
      data: issues,
      columnsConfig,
      filters,
      onFiltersChange: setFilters,
   });

   if (filters.length === 0) return null;

   return (
      <div className="w-full px-6 py-2 border-b border-border/60 bg-container">
         <DataTableFilter
            columns={columns}
            filters={filters}
            actions={actions}
            strategy={strategy}
         />
      </div>
   );
}
