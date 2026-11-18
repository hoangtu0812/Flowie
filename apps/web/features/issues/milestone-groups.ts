// Structural type so unit tests compile without the app's path aliases.
// VI: Kiểu cấu trúc để unit test biên dịch được mà không cần alias đường dẫn của app.
type DatedMilestone = { title: string; targetDate?: string | null };

export const NO_MILESTONE = 'no-milestone';

/**
 * Orders milestones for the "Group by: Milestone" display: earliest target date first, milestones
 * without a date after dated ones, then by title (letter case ignored). The caller puts the
 * "No milestone" group last.
 * VI: Sắp milestone cho chế độ "Group by: Milestone": ngày mục tiêu sớm nhất trước, milestone chưa
 * VI: có ngày xếp sau các mốc có ngày, rồi theo tên (không phân biệt hoa thường). Nơi gọi đặt nhóm
 * VI: "No milestone" ở cuối.
 */
export function compareMilestones(a: DatedMilestone, b: DatedMilestone): number {
   const dateA = a.targetDate ? Date.parse(a.targetDate) : Number.POSITIVE_INFINITY;
   const dateB = b.targetDate ? Date.parse(b.targetDate) : Number.POSITIVE_INFINITY;
   if (dateA !== dateB) return dateA < dateB ? -1 : 1;
   return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
}
