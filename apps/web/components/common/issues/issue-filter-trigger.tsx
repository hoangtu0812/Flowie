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
   const { issues, members, projects } = useIssuesStore();
   const { filters, setFilters } = useFilterStore();
   const columnsConfig = useMemo(
      () => createIssueFilterColumns(members, projects),
      [members, projects]
   );

   const { columns, actions, strategy } = useDataTableFilters({
      strategy: 'client',
      data: issues,
      columnsConfig,
      filters,
      onFiltersChange: setFilters,
   });

   return (
      <FilterSelector columns={columns} filters={filters} actions={actions} strategy={strategy} />
   );
}
