/** Date fields a timeline needs from an issue; values are ISO dates or timestamps. */
/** VI: Các trường ngày timeline cần từ một issue; giá trị là ngày hoặc thời điểm ISO. */
export interface ScheduledIssue {
   createdAt: string;
   startDate?: string | null;
   targetDate?: string | null;
   dueDate?: string | null;
}

const day = (value?: string | null) => (value ? value.slice(0, 10) : null);

/**
 * The days an issue's timeline bar covers, as `YYYY-MM-DD`. The planned schedule wins: the
 * bar starts at the target start (else the creation day) and ends at the target end (else
 * the due date). `end` is null when neither end date exists, which the bar draws dashed.
 * VI: Khoảng ngày thanh timeline của issue bao phủ, dạng `YYYY-MM-DD`. Schedule dự kiến được
 * VI: ưu tiên: thanh bắt đầu ở ngày bắt đầu dự kiến (không có thì ngày tạo) và kết thúc ở
 * VI: ngày kết thúc dự kiến (không có thì due date). `end` là null khi không có ngày kết thúc
 * VI: nào, khi đó thanh có viền nét đứt.
 */
export function issueSpan(issue: ScheduledIssue): { start: string; end: string | null } {
   return {
      start: day(issue.startDate) ?? day(issue.createdAt) ?? '',
      end: day(issue.targetDate) ?? day(issue.dueDate),
   };
}

/**
 * Whether a sub-issue's bar leaves its parent's dates: it starts before the parent's planned start
 * or ends after the parent's end (target end, else due date). A side is only compared when the
 * parent has that date, so an unplanned parent never flags its children.
 * VI: Thanh của sub-issue có vượt khỏi các ngày của cha không: bắt đầu trước ngày bắt đầu dự kiến
 * VI: của cha hoặc kết thúc sau ngày kết thúc của cha (ngày kết thúc dự kiến, không có thì due
 * VI: date). Chỉ so phía nào cha có ngày, nên cha chưa lên lịch không làm con bị đánh dấu.
 */
export function outsideParent(child: ScheduledIssue, parent: ScheduledIssue): boolean {
   const own = issueSpan(child);
   const parentStart = day(parent.startDate);
   const parentEnd = issueSpan(parent).end;
   return (
      Boolean(parentStart && own.start < parentStart) ||
      Boolean(parentEnd && own.end && own.end > parentEnd)
   );
}
