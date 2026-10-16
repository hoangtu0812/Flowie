/** Calendar arithmetic stays in date-only UTC space, independent of DST. */
export function effortSeries(
   rows: readonly { day: string; estimated: number; actual: number }[],
   weekStart: number
) {
   const mode = rows.length <= 45 ? 'day' : rows.length <= 150 ? 'week' : 'month';
   const groups = new Map<string, { day: string; estimated: number; actual: number }>();
   for (const row of rows) {
      const date = new Date(`${row.day}T00:00:00Z`);
      if (mode === 'week')
         date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() - ((weekStart + 1) % 7) + 7) % 7));
      const day =
         mode === 'month'
            ? row.day.slice(0, 7) + '-01'
            : mode === 'week'
              ? date.toISOString().slice(0, 10)
              : row.day;
      const value = groups.get(day) ?? { day, estimated: 0, actual: 0 };
      value.estimated += row.estimated;
      value.actual += row.actual;
      groups.set(day, value);
   }
   return [...groups.values()];
}
