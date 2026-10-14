export type IssueQuery = {
   scope?: 'assigned' | 'created' | 'subscribed' | 'activity';
   categories?: string[];
   projectId?: string;
   assigneeId?: string;
   creatorId?: string;
   cycleId?: string;
   query?: string;
   filters?: unknown[];
   includeSubIssues?: boolean;
};
export type PageMetadata = { total: number; limit: number; nextCursor: string | null };
export function issueQueryParams(input: IssueQuery): URLSearchParams {
   const params = new URLSearchParams();
   for (const [key, value] of Object.entries(input)) {
      if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0))
         continue;
      params.set(
         key,
         key === 'filters'
            ? JSON.stringify(value)
            : Array.isArray(value)
              ? value.join(',')
              : String(value)
      );
   }
   params.set('limit', '100');
   return params;
}
