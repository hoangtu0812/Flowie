export const NO_SUB_PROJECT = 'no-sub-project';

export interface SubProjectGroup<T> {
   id: string;
   name: string;
   color: string;
   issues: T[];
}

/**
 * Groups issues by sub project for the "Group by: Sub project" display. An issue with several
 * sub projects appears in each of their groups, so group counts may add up to more than the
 * issue count; issues without one go to the last group, "No sub project". Other groups are
 * ordered by name, letter case ignored. Only groups with at least one issue are returned.
 * VI: Gom issue theo sub project cho chế độ "Group by: Sub project". Issue có nhiều sub project
 * VI: xuất hiện ở mỗi nhóm tương ứng, nên tổng số theo nhóm có thể lớn hơn số issue; issue chưa
 * VI: có sub project vào nhóm cuối "No sub project". Các nhóm khác sắp theo tên, không phân biệt
 * VI: hoa thường. Chỉ trả nhóm có ít nhất một issue.
 */
export function groupBySubProject<
   T extends { subProjectLabels?: { id: string; name: string; color: string }[] },
>(issues: T[]): SubProjectGroup<T>[] {
   const groups = new Map<string, SubProjectGroup<T>>();
   const none: SubProjectGroup<T> = {
      id: NO_SUB_PROJECT,
      name: 'No sub project',
      color: '#8f9299',
      issues: [],
   };
   for (const issue of issues) {
      const labels = issue.subProjectLabels ?? [];
      if (!labels.length) none.issues.push(issue);
      for (const label of labels) {
         const group = groups.get(label.id) ?? { ...label, issues: [] };
         group.issues.push(issue);
         groups.set(label.id, group);
      }
   }
   const named = [...groups.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
   );
   return none.issues.length ? [...named, none] : named;
}

/**
 * Sub projects of an issue other than the one of the group it is listed in, for the
 * "Other sub projects" column; without a group id every sub project is kept.
 * VI: Các sub project của issue khác với sub project của nhóm đang chứa nó, cho cột
 * VI: "Other sub projects"; không có id nhóm thì giữ mọi sub project.
 */
export function otherSubProjects<T extends { id: string }>(labels: T[], groupId?: string): T[] {
   return groupId ? labels.filter((label) => label.id !== groupId) : labels;
}
