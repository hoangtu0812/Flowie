'use client';

import { FilterSelector } from '@/components/data-table-filter/components/filter-selector';
import { useDataTableFilters } from '@/components/data-table-filter/hooks/use-data-table-filters';
import { useFilterStore } from '@/store/filter-store';
import { useIssuesStore } from '@/store/issues-store';
import { useMemo } from 'react';
import { createIssueFilterColumns } from './issue-filter-columns';

/**
 * Standalone "Filter" button for the header toolbars, on the same row as
 * the issue count / Display options (Linear-style). The applied filter
 * chips live in <IssueFilterBar/>, which only shows up once at least one
 * filter is active.
 */
export function IssueFilterTrigger() {
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

   return (
      <FilterSelector columns={columns} filters={filters} actions={actions} strategy={strategy} />
   );
}
