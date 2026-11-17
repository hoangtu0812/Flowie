/**
 * `YYYY-MM-DD` of a local calendar day, so "today" follows the user's clock, not UTC.
 * VI: `YYYY-MM-DD` của một ngày theo lịch máy người dùng, để "hôm nay" theo đồng hồ của họ, không theo UTC.
 */
export function localDay(date = new Date()) {
   const pad = (value: number) => String(value).padStart(2, '0');
   return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Monday of the week containing `day`, shifted by `weeks`; both in and out as `YYYY-MM-DD`.
 * VI: Thứ Hai của tuần chứa `day`, dịch thêm `weeks` tuần; vào và ra đều dạng `YYYY-MM-DD`.
 */
export function mondayOf(day: string, weeks = 0) {
   const [year, month, date] = day.split('-').map(Number);
   const value = new Date(year, month - 1, date);
   value.setDate(value.getDate() - ((value.getDay() + 6) % 7) + weeks * 7);
   return localDay(value);
}
