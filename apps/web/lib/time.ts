/** Legacy API instants without offsets are UTC; calendar dates remain date-only. */
export function parseInstant(value: string): Date {
   const normalized = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value)
      ? `${value}Z`
      : value;
   return new Date(normalized);
}

export function relativeTime(value: string, now = Date.now()): string {
   const instant = parseInstant(value).getTime();
   if (!Number.isFinite(instant)) return 'Unknown time';
   const seconds = Math.floor((now - instant) / 1000);
   if (Math.abs(seconds) < 60) return 'just now';
   const amount = Math.abs(seconds);
   const unit = amount < 3600 ? 'm' : amount < 86400 ? 'h' : 'd';
   const count = Math.floor(amount / (unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400));
   return seconds < 0 ? `in ${count}${unit}` : `${count}${unit} ago`;
}
