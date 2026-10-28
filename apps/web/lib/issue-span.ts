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
