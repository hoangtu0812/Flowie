// Cấu hình cột trạng thái cho List/Kanban (Luminous Professional palette).
export interface StatusDef {
  key: string;
  label: string;
  chipBg: string;
  chipText: string;
  dot: string;
}

export const STATUSES: StatusDef[] = [
  { key: "in_progress", label: "In Work", chipBg: "bg-[#f4ebff]", chipText: "text-[#9d4edd]", dot: "bg-purple-500" },
  { key: "todo", label: "To Do", chipBg: "bg-[#e8f0fe]", chipText: "text-blue-600", dot: "bg-blue-500" },
  { key: "in_review", label: "On Review", chipBg: "bg-[#fff3e0]", chipText: "text-[#ef6c00]", dot: "bg-orange-500" },
  { key: "done", label: "Done", chipBg: "bg-[#e6f4ea]", chipText: "text-[#1e8e3e]", dot: "bg-green-500" },
];

export const statusByKey = (k: string) =>
  STATUSES.find((s) => s.key === k) ?? STATUSES[0];

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
