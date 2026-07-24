import { CalendarItem } from "./api";

// Khung giờ hiển thị của time-grid.
export const START_HOUR = 6;
export const END_HOUR = 22; // exclusive-ish; rows START_HOUR..END_HOUR-1
export const ROW_H = 56; // px mỗi giờ

export function hours(): number[] {
  return Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
}

export function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}
export function fmtTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function startOfWeek(d: Date): Date {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}
export function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Màu sự kiện theo status.
export interface EventColor {
  bg: string;
  border: string;
  text: string;
}
export const EVENT_COLORS: Record<string, EventColor> = {
  todo: { bg: "#eef1f7", border: "#9aa2ad", text: "#434655" },
  in_progress: { bg: "#e5eeff", border: "#004ac6", text: "#003ea8" },
  in_review: { bg: "#fff1e8", border: "#943700", text: "#7d2d00" },
  done: { bg: "#e7f6ea", border: "#3a7d44", text: "#2f6a3a" },
};
export const eventColor = (status: string): EventColor =>
  EVENT_COLORS[status] ?? EVENT_COLORS.todo;

// Vị trí (top/height px) của một sự kiện có thời gian trong ngày.
export function eventBox(item: CalendarItem): { top: number; height: number } | null {
  if (!item.startAt) return null;
  const s = new Date(item.startAt);
  const e = item.endAt ? new Date(item.endAt) : new Date(s.getTime() + 60 * 60000);
  const startMin = (s.getHours() - START_HOUR) * 60 + s.getMinutes();
  const endMin = (e.getHours() - START_HOUR) * 60 + e.getMinutes();
  const top = (startMin / 60) * ROW_H;
  const height = Math.max(22, ((endMin - startMin) / 60) * ROW_H);
  return { top, height };
}
