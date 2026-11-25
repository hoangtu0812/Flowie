/**
 * Pure helpers for the Gantt view of the Project timeline: progress of a bar, whether a
 * dependency is late, and the elbow path of a dependency arrow.
 * VI: Hàm thuần cho dạng Gantt của timeline Project: tiến độ của thanh, phụ thuộc có trễ không,
 * VI: và đường gấp khúc của mũi tên phụ thuộc.
 */

type Category = string;

/**
 * Percent done of an issue from real data only: a completed issue is 100, a parent is the share
 * of its non-canceled sub-issues that are completed, anything else is 0 (Flowie stores no manual
 * percent).
 * VI: Phần trăm hoàn thành chỉ từ dữ liệu thật: issue đã xong là 100, issue cha là tỉ lệ sub-issue
 * VI: (không tính đã huỷ) đã xong, còn lại là 0 (Flowie không lưu phần trăm nhập tay).
 */
export function issueProgress(category: Category, childCategories: Category[]): number {
   if (category === 'completed') return 100;
   const counted = childCategories.filter((child) => child !== 'canceled');
   if (counted.length === 0) return 0;
   return Math.round(
      (counted.filter((child) => child === 'completed').length / counted.length) * 100
   );
}

/**
 * A dependency is late when the blocker is not done and is planned to end after the blocked issue
 * starts. Dates are `YYYY-MM-DD`; a blocker without an end date is never late.
 * VI: Phụ thuộc bị trễ khi issue chặn chưa xong và dự kiến kết thúc sau ngày issue bị chặn bắt
 * VI: đầu. Ngày dạng `YYYY-MM-DD`; issue chặn chưa có ngày kết thúc thì không tính trễ.
 */
export function isLateDependency(
   blocker: { end: string | null; done: boolean },
   blockedStart: string
): boolean {
   return !blocker.done && blocker.end !== null && blocker.end > blockedStart;
}

/** Room an arrow keeps from a bar edge. VI: Khoảng cách mũi tên giữ với mép thanh. */
const GAP = 8;

/**
 * SVG path from the end of the blocker bar (x1, y1) to the start of the blocked bar (x2, y2). It
 * runs right, down, and right; when the blocked bar starts left of the blocker's end, it turns back
 * between the two rows (`rowHeight` apart at least) so the line never crosses a bar.
 * VI: Đường SVG từ cuối thanh chặn (x1, y1) tới đầu thanh bị chặn (x2, y2). Đi sang phải, xuống,
 * VI: rồi sang phải; khi thanh bị chặn bắt đầu bên trái điểm cuối thanh chặn thì vòng lại giữa hai
 * VI: hàng để đường không cắt qua thanh.
 */
export function dependencyPath(
   x1: number,
   y1: number,
   x2: number,
   y2: number,
   rowHeight: number
): string {
   if (x2 - x1 >= GAP * 2) return `M${x1} ${y1}H${x1 + GAP}V${y2}H${x2}`;
   const turn = y2 + (y2 > y1 ? -rowHeight / 2 : rowHeight / 2);
   return `M${x1} ${y1}H${x1 + GAP}V${turn}H${x2 - GAP}V${y2}H${x2}`;
}

/**
 * Whether a bar `width` px wide can show `title` (and a percent) inside it. Text is estimated at
 * 6.5 px per character of the 12 px label plus padding; a bar that cannot fit it shows the label to
 * its right instead, so 1–2 day bars stay readable.
 * shortcut: estimated, not measured text width; measure with canvas if labels clip or jump.
 * VI: Thanh rộng `width` px có chứa được `title` (và phần trăm) không. Ước 6,5 px mỗi ký tự của
 * VI: nhãn 12 px cộng lề; thanh không chứa được thì nhãn nằm bên phải thanh, để thanh 1–2 ngày vẫn
 * VI: đọc được.
 */
export function labelFitsInside(width: number, title: string, withPercent: boolean): boolean {
   const needed = 16 + Math.min(title.length, 24) * 6.5 + (withPercent ? 36 : 0);
   return width >= needed;
}
