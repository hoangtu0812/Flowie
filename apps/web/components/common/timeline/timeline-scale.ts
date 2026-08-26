/**
 * Shared geometry for every timeline view: a fixed, deterministic date range
 * mapped to pixels. Keeping it in one module means the Projects timeline and
 * the Project issues timeline agree on where a date sits, so the two read as
 * the same instrument at the same zoom.
 */

/* Wide, deterministic range (feels infinite): Jan 2020 → Dec 2032 (SSR safe). */
export const RANGE_START = Date.UTC(2020, 0, 1);
export const RANGE_END = Date.UTC(2032, 11, 31);

/** Width of the sticky list column on the left of a timeline. */
export const LIST_WIDTH = 224;

/** Zoom levels for the scale dropdown (month column width in px). */
export const ZOOM_LEVELS = [
   { id: 'year', label: 'Year', shortcut: 'Y', monthWidth: 120 },
   { id: 'quarter', label: 'Quarter', shortcut: 'Q', monthWidth: 240 },
   { id: 'month', label: 'Month', shortcut: 'M', monthWidth: 480 },
   { id: 'week', label: 'Week', shortcut: 'W', monthWidth: 960 },
] as const;

export type TimelineZoom = (typeof ZOOM_LEVELS)[number]['id'];

export const monthWidthOf = (zoom: TimelineZoom) =>
   ZOOM_LEVELS.find((level) => level.id === zoom)!.monthWidth;

export interface MonthCell {
   key: string;
   label: string;
}

export const MONTHS: MonthCell[] = [];
for (let index = 0; ; index++) {
   const date = new Date(Date.UTC(2020, index, 1));
   if (date.getTime() > RANGE_END) break;
   MONTHS.push({
      key: date.toISOString().slice(0, 7),
      label:
         date.getUTCMonth() === 0
            ? `${date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${date.getUTCFullYear()}`
            : date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
   });
}

export const totalWidthOf = (monthWidth: number) => MONTHS.length * monthWidth;

/* --------------------------- Scale date labels --------------------------- */

export const DAY_MS = 86_400_000;
/** First Monday inside the range (Jan 6, 2020). */
export const FIRST_MONDAY = Date.UTC(2020, 0, 6);

export interface ScaleDate {
   time: number;
   /** Day of month, e.g. 17. */
   day: number;
   /** ISO week number, for the "Show week numbers" display option. */
   week: number;
}

export const isoWeekOf = (time: number): number => {
   const date = new Date(time);
   const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
   const dayNumber = (target.getUTCDay() + 6) % 7;
   target.setUTCDate(target.getUTCDate() - dayNumber + 3);
   const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
   const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
   firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);
   return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * DAY_MS));
};

/** Every Monday of the range (weekly ticks + zoomed-in date labels). */
export const WEEKLY_DATES: ScaleDate[] = [];
for (let time = FIRST_MONDAY; time <= RANGE_END; time += 7 * DAY_MS) {
   WEEKLY_DATES.push({ time, day: new Date(time).getUTCDate(), week: isoWeekOf(time) });
}

/** Every other Monday (date labels at the Year zoom). */
export const BIWEEKLY_DATES: ScaleDate[] = WEEKLY_DATES.filter((_, index) => index % 2 === 0);

export const offsetForTime = (time: number, monthWidth: number): number =>
   ((time - RANGE_START) / (RANGE_END - RANGE_START)) * totalWidthOf(monthWidth);

/** Pixel offset of an ISO date (or datetime — only the date part is read). */
export const offsetFor = (iso: string, monthWidth: number): number => {
   const time = Date.UTC(
      Number(iso.slice(0, 4)),
      Number(iso.slice(5, 7)) - 1,
      Number(iso.slice(8, 10))
   );
   const clamped = Math.min(Math.max(time, RANGE_START), RANGE_END);
   return ((clamped - RANGE_START) / (RANGE_END - RANGE_START)) * totalWidthOf(monthWidth);
};
