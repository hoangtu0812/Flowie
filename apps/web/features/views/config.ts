import type { FiltersState } from '../../components/data-table-filter/core/types';
import type { IssueQuery } from '../issues/issue-query';

export type IssueViewConfig = {
   version: 1;
   teamId?: string;
   query: Omit<IssueQuery, 'scope' | 'filters'> & { filters: FiltersState };
};

export function captureIssueView(rawQuery: string): IssueViewConfig {
   const params = new URLSearchParams(rawQuery);
   if (params.has('scope')) throw new Error('Personal scopes cannot be saved as views.');
   const query: IssueViewConfig['query'] = {
      filters: JSON.parse(params.get('filters') ?? '[]') as FiltersState,
      includeSubIssues: params.get('includeSubIssues') !== 'false',
   };
   for (const key of ['projectId', 'assigneeId', 'creatorId', 'cycleId', 'query'] as const) {
      const value = params.get(key);
      if (value) query[key] = value;
   }
   for (const key of ['noTeam', 'noProject'] as const) {
      if (params.get(key) === 'true') query[key] = true;
   }
   const issueType = params.get('issueType');
   if (issueType === 'BUG' || issueType === 'TASK' || issueType === 'EPIC')
      query.issueType = issueType;
   const categories = params.get('categories');
   if (categories) query.categories = categories.split(',');
   return { version: 1, ...(params.get('teamId') ? { teamId: params.get('teamId')! } : {}), query };
}

export function isIssueViewConfig(value: Record<string, unknown>): value is IssueViewConfig {
   return (
      value.version === 1 &&
      typeof value.query === 'object' &&
      value.query !== null &&
      Array.isArray((value.query as { filters?: unknown }).filters)
   );
}
