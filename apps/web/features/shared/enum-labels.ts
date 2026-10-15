'use client';
import { useLocale } from './use-locale';
const values: Record<string, readonly [string, string]> = {
   TASK: ['Task', 'Task'],
   BUG: ['Bug', 'Bug'],
   NONE: ['None', 'Không'],
   LOW: ['LOW', 'THẤP'],
   MEDIUM: ['MEDIUM', 'TRUNG BÌNH'],
   HIGH: ['HIGH', 'CAO'],
   URGENT: ['URGENT', 'KHẨN CẤP'],
   CRITICAL: ['CRITICAL', 'NGHIÊM TRỌNG'],
   DAILY: ['DAILY', 'HẰNG NGÀY'],
   WEEKLY: ['WEEKLY', 'HẰNG TUẦN'],
   MONTHLY: ['MONTHLY', 'HẰNG THÁNG'],
   RUNNING: ['RUNNING', 'ĐANG CHẠY'],
   PAUSED: ['PAUSED', 'TẠM DỪNG'],
   COMPLETED: ['COMPLETED', 'HOÀN TẤT'],
   CANCELED: ['CANCELED', 'ĐÃ HỦY'],
   CANCELLED: ['CANCELLED', 'ĐÃ HỦY'],
   FAILED: ['FAILED', 'LỖI'],
   PENDING: ['PENDING', 'ĐANG ĐỢI'],
   QUEUED: ['QUEUED', 'ĐÃ XẾP HÀNG'],
   DONE: ['DONE', 'XONG'],
   VALID: ['VALID', 'HỢP LỆ'],
   INVALID: ['INVALID', 'KHÔNG HỢP LỆ'],
   DUPLICATE: ['DUPLICATE', 'TRÙNG'],
   SKIPPED: ['SKIPPED', 'BỎ QUA'],
   PREVIEW: ['PREVIEW', 'XEM TRƯỚC'],
   EXPIRED: ['EXPIRED', 'HẾT HẠN'],
   TRIAGE: ['TRIAGE', 'PHÂN LOẠI'],
   BACKLOG: ['BACKLOG', 'TỒN ĐỌNG'],
   UNSTARTED: ['UNSTARTED', 'CHƯA BẮT ĐẦU'],
   STARTED: ['STARTED', 'ĐANG THỰC HIỆN'],
   MANUAL: ['MANUAL', 'THỦ CÔNG'],
   TRACKED: ['TRACKED', 'ĐANG THEO DÕI'],
   RESTRICTED: ['RESTRICTED', 'GIỚI HẠN QUYỀN'],
   UNMANAGED: ['UNMANAGED', 'CHƯA THEO DÕI'],
};
/** Only domain enum codes belong here; persisted user-defined names remain unchanged. */
export function useEnumLabel() {
   const { locale } = useLocale();
   return (value: string) => values[value]?.[locale === 'vi' ? 1 : 0] ?? value;
}
export function useWeekdayLabel() {
   const { tag } = useLocale();
   return (day: number) =>
      new Intl.DateTimeFormat(tag, { weekday: 'long', timeZone: 'UTC' }).format(
         new Date(Date.UTC(2024, 0, 1 + day))
      );
}
