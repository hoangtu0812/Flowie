export function bulkQuery(encoded: string): Record<string, unknown> {
   const result: Record<string, unknown> = {};
   const allowed = new Set([
      'teamId',
      'issueType',
      'projectId',
      'assigneeId',
      'creatorId',
      'cycleId',
      'scope',
      'query',
   ]);
   for (const [key, value] of new URLSearchParams(encoded)) {
      // Sort and ordering change only the row order, never which issues match, so a sorted
      // list can still be exported or bulk-changed.
      // VI: Sort và ordering chỉ đổi thứ tự dòng, không đổi công việc nào khớp, nên danh sách
      // VI: đang sort vẫn xuất hoặc sửa hàng loạt được.
      if (['workspaceId', 'limit', 'cursor', 'sort', 'ordering'].includes(key)) continue;
      if (allowed.has(key)) result[key] = value;
      else if (key === 'categories') result[key] = value.split(',');
      else if (key === 'filters') result[key] = JSON.parse(value);
      else if (['includeSubIssues', 'noTeam', 'noProject'].includes(key))
         result[key] = value === 'true';
      else throw new Error(`This list filter cannot be used for bulk changes: ${key}`);
   }
   return result;
}
