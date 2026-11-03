type SearchableIssue = { identifier: string; title: string; description?: string };
const normalize = (value: string) =>
   value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLocaleLowerCase();

/** Searches identifiers and titles within the authorized, filtered view collection.
 * VI: Tìm mã và tiêu đề trong tập dữ liệu được cấp quyền và lọc của view. */
export function searchIssueCollection<T extends SearchableIssue>(
   issues: readonly T[],
   query: string
): T[] {
   const needle = normalize(query.trim());
   return needle
      ? issues.filter((issue) => normalize(`${issue.identifier} ${issue.title}`).includes(needle))
      : [];
}
