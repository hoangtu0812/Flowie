/**
 * Groups a flat issue list into a parent → children tree for nested rows. An issue is a root when
 * it has no parent or its parent is not in the list (another project, filtered out or archived),
 * so no issue disappears from the view. The server rejects cycles, so the tree is finite.
 * VI: Gom danh sách issue phẳng thành cây cha → con cho các hàng lồng nhau. Issue là gốc khi
 * VI: không có cha hoặc cha không nằm trong danh sách (project khác, bị lọc hoặc đã archive), nên
 * VI: không issue nào biến mất khỏi màn hình. Server chặn chu trình nên cây luôn hữu hạn.
 */
export function issueTree<T extends { id: string; parentIssueId?: string | null }>(issues: T[]) {
   const ids = new Set(issues.map((issue) => issue.id));
   const roots: T[] = [];
   const children = new Map<string, T[]>();
   for (const issue of issues) {
      if (!issue.parentIssueId || !ids.has(issue.parentIssueId)) {
         roots.push(issue);
         continue;
      }
      children.set(issue.parentIssueId, [...(children.get(issue.parentIssueId) ?? []), issue]);
   }
   return { roots, children };
}

/**
 * Progress of a parent from its direct children: completed counts statuses in the Completed
 * category (any letter case, since mock and API data differ), total counts every listed child.
 * Grandchildren are left out so one finished task is never counted twice.
 * VI: Tiến độ của cha theo con trực tiếp: completed đếm trạng thái thuộc nhóm Completed (không
 * VI: phân biệt hoa thường vì dữ liệu mock và API khác nhau), total đếm mọi con trong danh sách.
 * VI: Không tính cháu để một task hoàn thành không bị đếm hai lần.
 */
export function directProgress(children: { status: { category: string } }[] = []) {
   const completed = children.filter(
      (child) => child.status.category.toLowerCase() === 'completed'
   ).length;
   return { completed, total: children.length };
}
