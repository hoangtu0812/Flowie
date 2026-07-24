// Shared display formatters.

const MONTHS = ["Th1", "Th2", "Th3", "Th4", "Th5", "Th6", "Th7", "Th8", "Th9", "Th10", "Th11", "Th12"];

/** "2026-07" → "Th7". Falls back to the raw value when unparseable. */
export function monthLabel(ym: string): string {
  const [, m] = ym.split("-");
  const idx = parseInt(m, 10) - 1;
  return MONTHS[idx] ?? ym;
}

/** Formats a number as USD currency. */
export function money(n: number): string {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/** Compact hour display, e.g. 12.5 → "12.5h". */
export function hours(n: number): string {
  return `${n.toFixed(1)}h`;
}
