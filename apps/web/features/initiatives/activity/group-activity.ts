import { parseInstant } from '../../../lib/time';

/** Month keys include the year and use the reader's timezone, including at UTC boundaries. */
export function groupActivityByMonth<T extends { createdAt: string }>(
   rows: T[],
   locale: string,
   timezone: string
) {
   const groups = new Map<string, { key: string; label: string; rows: T[] }>();
   const keyFormat = new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: '2-digit',
      timeZone: timezone,
   });
   const labelFormat = new Intl.DateTimeFormat(locale, {
      month: 'long',
      year: 'numeric',
      timeZone: timezone,
   });
   for (const row of rows) {
      const date = parseInstant(row.createdAt);
      const valid = Number.isFinite(date.getTime());
      const parts = valid ? keyFormat.formatToParts(date) : [];
      const key = valid
         ? `${parts.find((part) => part.type === 'year')!.value}-${parts.find((part) => part.type === 'month')!.value}`
         : 'unknown';
      if (!groups.has(key))
         groups.set(key, { key, label: valid ? labelFormat.format(date) : '—', rows: [] });
      groups.get(key)!.rows.push(row);
   }
   return [...groups.values()];
}
