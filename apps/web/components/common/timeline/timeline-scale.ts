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

/* ------------------------------ Drag to reschedule ------------------------------ */

/** Narrowest bar of a dated issue, so a one-day issue stays grabbable. */
/** VI: Độ rộng nhỏ nhất của thanh issue có ngày, để issue một ngày vẫn nắm kéo được. */
export const MIN_DATED_BAR_WIDTH = 20;
/** Width of a bar without an end date (drawn dashed). */
/** VI: Độ rộng thanh của issue chưa có ngày kết thúc (vẽ nét đứt). */
export const MIN_UNSCHEDULED_BAR_WIDTH = 130;

/** Pixels one day spans at a zoom. VI: Số pixel của một ngày ở mức zoom. */
export const dayWidthOf = (monthWidth: number): number =>
   offsetForTime(RANGE_START + DAY_MS, monthWidth);

/**
 * `YYYY-MM-DD` moved by whole days. UTC arithmetic keeps daylight-saving changes from shifting
 * the date.
 * VI: `YYYY-MM-DD` dời theo số ngày nguyên. Tính theo UTC để giờ mùa hè không làm lệch ngày.
 */
export const addDays = (iso: string, days: number): string =>
   new Date(
      Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) +
         days * DAY_MS
   )
      .toISOString()
      .slice(0, 10);

/** Left offset and width of a bar covering `start`..`end` (`end` null draws a fixed width). */
/** VI: Toạ độ trái và độ rộng của thanh phủ `start`..`end` (`end` null thì độ rộng cố định). */
export function barGeometry(start: string, end: string | null, monthWidth: number) {
   const left = offsetFor(start, monthWidth);
   const width = end
      ? Math.max(offsetFor(end, monthWidth) - left, MIN_DATED_BAR_WIDTH)
      : MIN_UNSCHEDULED_BAR_WIDTH;
   return { left, width };
}

/** Part of a bar being dragged: the body moves it, the edges resize it. */
/** VI: Phần thanh đang được kéo: thân để dời, hai mép để đổi độ dài. */
export type DragMode = 'move' | 'start' | 'end';

/**
 * The dates a bar lands on after a drag of `days` whole days. Moving keeps the length (an issue
 * without an end keeps none); a resize never puts the end before the start, it stops on the same
 * day. Dragging the end of a bar without an end date sets one, so the caller passes the date
 * under the bar's right edge as `end` for that mode.
 * VI: Các ngày thanh rơi vào sau khi kéo `days` ngày nguyên. Dời giữ nguyên độ dài (issue chưa có
 * VI: ngày kết thúc thì vẫn không có); đổi độ dài không bao giờ đặt ngày kết thúc trước ngày bắt
 * VI: đầu mà dừng ở cùng ngày. Kéo mép phải của thanh chưa có ngày kết thúc sẽ đặt ngày đó, nên
 * VI: nơi gọi truyền ngày dưới mép phải của thanh làm `end` cho chế độ này.
 */
export function dragSchedule(
   span: { start: string; end: string | null },
   mode: DragMode,
   days: number
): { start: string; end: string | null } {
   const { start, end } = span;
   if (mode === 'move') return { start: addDays(start, days), end: end && addDays(end, days) };
   if (mode === 'start') {
      const next = addDays(start, days);
      return { start: end && next > end ? end : next, end };
   }
   const next = addDays(end ?? start, days);
   return { start, end: next < start ? start : next };
}
