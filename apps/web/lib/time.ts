/** Legacy API instants without offsets are UTC; calendar dates remain date-only. */
export function parseInstant(value: string): Date {
   const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)
      ? `${value}Z`
      : value;
   return new Date(normalized);
}

export function relativeTime(value: string, now = Date.now(), locale = 'en'): string {
   const instant = parseInstant(value).getTime();
   if (!Number.isFinite(instant))
      return locale.startsWith('vi') ? 'Không rõ thời gian' : 'Unknown time';
   const seconds = Math.floor((now - instant) / 1000);
   if (Math.abs(seconds) < 60)
      return locale.startsWith('vi') ? (seconds < 0 ? 'sắp tới' : 'vừa xong') : 'just now';
   const amount = Math.abs(seconds);
   const unit = amount < 3600 ? 'm' : amount < 86400 ? 'h' : 'd';
   const count = Math.floor(amount / (unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400));
   if (locale.startsWith('vi'))
      return new Intl.RelativeTimeFormat('vi-VN', { numeric: 'auto' }).format(
         seconds < 0 ? count : -count,
         unit === 'm' ? 'minute' : unit === 'h' ? 'hour' : 'day'
      );
   return seconds < 0 ? `in ${count}${unit}` : `${count}${unit} ago`;
}
