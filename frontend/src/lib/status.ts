// Cấu hình cột trạng thái cho List/Kanban (Luminous Professional palette).
export interface StatusDef {
  key: string;
  label: string;
  chipBg: string;
  chipText: string;
  dot: string;
  /** Resolved colour, present for project-defined columns. */
  hex?: string;
  /** Inline chip styles, used when the colour is arbitrary hex. */
  style?: { backgroundColor: string; color: string };
}

export const STATUSES: StatusDef[] = [
  { key: "in_progress", label: "In Work", chipBg: "bg-[#f4ebff]", chipText: "text-[#9d4edd]", dot: "bg-purple-500", hex: "#9d4edd" },
  { key: "todo", label: "To Do", chipBg: "bg-[#e8f0fe]", chipText: "text-blue-600", dot: "bg-blue-500", hex: "#2563eb" },
  { key: "in_review", label: "On Review", chipBg: "bg-[#fff3e0]", chipText: "text-[#ef6c00]", dot: "bg-orange-500", hex: "#ef6c00" },
  { key: "done", label: "Done", chipBg: "bg-[#e6f4ea]", chipText: "text-[#1e8e3e]", dot: "bg-green-500", hex: "#1e8e3e" },
];

export const statusByKey = (k: string) =>
  STATUSES.find((s) => s.key === k) ?? STATUSES[0];

// Palette for project-defined columns (Module 3.1). Keys map to the `color`
// stored on workflow_statuses.
export const STATUS_PALETTE: Record<string, { chipBg: string; chipText: string; dot: string }> = {
  blue: { chipBg: "bg-[#e8f0fe]", chipText: "text-blue-600", dot: "bg-blue-500" },
  purple: { chipBg: "bg-[#f4ebff]", chipText: "text-[#9d4edd]", dot: "bg-purple-500" },
  orange: { chipBg: "bg-[#fff3e0]", chipText: "text-[#ef6c00]", dot: "bg-orange-500" },
  green: { chipBg: "bg-[#e6f4ea]", chipText: "text-[#1e8e3e]", dot: "bg-green-500" },
  red: { chipBg: "bg-[#fdecea]", chipText: "text-[#c5221f]", dot: "bg-red-500" },
  gray: { chipBg: "bg-gray-100", chipText: "text-gray-600", dot: "bg-gray-400" },
};
export const STATUS_COLOR_KEYS = Object.keys(STATUS_PALETTE);

/** Hex equivalent of each legacy palette name. */
const LEGACY_HEX: Record<string, string> = {
  blue: "#2563eb",
  purple: "#9d4edd",
  orange: "#ef6c00",
  green: "#1e8e3e",
  red: "#c5221f",
  gray: "#9aa2ad",
};

/**
 * Resolves a workflow colour to hex.
 *
 * Colours are now free-form hex picked from a colour picker, but projects
 * created before that stored one of six palette names — both must keep working.
 */
export function statusHex(color: string): string {
  if (color?.startsWith("#")) return color;
  return LEGACY_HEX[color] ?? LEGACY_HEX.blue;
}

/**
 * Inline chip styles for an arbitrary status colour. Tailwind cannot generate
 * classes for colours that only exist at runtime, so the tint is derived here:
 * the hex at ~12% alpha behind full-strength hex text.
 */
export function statusChipStyle(color: string): { backgroundColor: string; color: string } {
  const hex = statusHex(color);
  return { backgroundColor: `${hex}1f`, color: hex };
}

/**
 * Builds the donut/bar segments for a "by status" chart.
 *
 * Charts used to look each key up in a hard-coded four-entry map, so a column
 * added in project settings appeared as a grey slice labelled with its raw key
 * ("wait"). `meta` comes from the overview endpoint and covers every column the
 * project actually defines.
 */
export function statusSegments(
  byStatus: Record<string, number>,
  meta: { key: string; label: string; color: string }[] = [],
): { label: string; value: number; color: string }[] {
  const byKey = new Map(meta.map((m) => [m.key, m]));
  return Object.entries(byStatus).map(([key, value]) => {
    const m = byKey.get(key);
    if (m) return { label: m.label, value, color: statusHex(m.color) };
    // No workflow row for this key: fall back to the built-in defs, then to the
    // key itself so the slice is still identifiable.
    const builtin = STATUSES.find((s) => s.key === key);
    return {
      label: builtin?.label ?? key,
      value,
      color: builtin?.hex ?? "#9aa2ad",
    };
  });
}

/** Suggested swatches in the picker — a starting point, not a limit. */
export const STATUS_SWATCHES = [
  "#2563eb", "#0ea5e9", "#06b6d4", "#10b981",
  "#22c55e", "#84cc16", "#eab308", "#f59e0b",
  "#ef6c00", "#ef4444", "#ec4899", "#a855f7",
  "#9d4edd", "#6366f1", "#64748b", "#334155",
];

/**
 * Maps project-defined workflow statuses onto the StatusDef shape the board
 * renders. Falls back to the built-in columns when a project has none, so the
 * board never renders empty.
 */
export function toStatusDefs(
  statuses: { key: string; name: string; color: string }[],
): StatusDef[] {
  if (!statuses || statuses.length === 0) return STATUSES;
  return statuses.map((s) => {
    const hex = statusHex(s.color);
    return {
      key: s.key,
      label: s.name,
      hex,
      // Empty class strings: callers style these chips with `style` because the
      // colour is arbitrary. Kept on the type so existing call sites compile.
      chipBg: "",
      chipText: "",
      dot: "",
      style: statusChipStyle(s.color),
    };
  });
}

// Màu hex cho biểu đồ (conic-gradient cần màu thật).
export const STATUS_HEX: Record<string, string> = {
  todo: "#9aa2ad",
  in_progress: "#004ac6",
  in_review: "#943700",
  done: "#3a7d44",
};
export const PRIORITY_HEX: Record<string, string> = {
  low: "#9aa2ad",
  medium: "#2563eb",
  high: "#943700",
  urgent: "#ba1a1a",
};
export const statusLabel = (k: string) => statusByKey(k).label;

// Bảng màu cho label (khớp token Luminous Professional).
export const LABEL_COLORS: Record<string, string> = {
  primary: "bg-primary-container/10 text-primary",
  tertiary: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  success: "bg-success-container text-success",
  error: "bg-error-container text-on-error-container",
  neutral: "bg-surface-container-high text-on-surface-variant",
};
export const labelColor = (c: string) => LABEL_COLORS[c] ?? LABEL_COLORS.primary;
export const LABEL_COLOR_KEYS = Object.keys(LABEL_COLORS);

export const PRIORITIES: Record<string, { label: string; cls: string }> = {
  low: { label: "Low", cls: "bg-surface-container-highest text-on-surface-variant" },
  medium: { label: "Medium", cls: "bg-primary-container/10 text-primary" },
  high: { label: "High", cls: "bg-error-container text-on-error-container" },
  urgent: { label: "Urgent", cls: "bg-error text-on-error" },
};
