export function formatDate(
   value: string | null,
   locale: string,
   timezone: string,
   options: Intl.DateTimeFormatOptions = {}
) {
   if (!value) return '—';
   // A calendar date has no instant and must not shift into the previous day.
   const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
   const date = new Date(dateOnly ? value + 'T00:00:00Z' : value);
   if (!Number.isFinite(date.getTime())) return '—';
   return new Intl.DateTimeFormat(locale, {
      ...(dateOnly ? { dateStyle: 'medium' } : { dateStyle: 'medium', timeStyle: 'short' }),
      ...options,
      timeZone: dateOnly ? 'UTC' : timezone,
   }).format(date);
}
