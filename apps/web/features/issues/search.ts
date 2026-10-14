type SearchableIssue = { identifier: string; title: string; description?: string };
const normalize = (value: string) =>
   value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLocaleLowerCase();

/** Searches only the collection supplied by the active view's authorization and filters. */
export function searchIssueCollection<T extends SearchableIssue>(
   issues: readonly T[],
   query: string
): T[] {
   const needle = normalize(query.trim());
   return needle
      ? issues.filter((issue) =>
           normalize(`${issue.identifier} ${issue.title} ${issue.description ?? ''}`).includes(
              needle
           )
        )
      : [];
}
