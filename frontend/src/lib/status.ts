// Cấu hình cột trạng thái cho List/Kanban (Luminous Professional palette).
export interface StatusDef {
  key: string;
  label: string;
  chipBg: string;
  chipText: string;
  dot: string;
}

export const STATUSES: StatusDef[] = [
  { key: "todo", label: "To Do", chipBg: "bg-surface-container-high", chipText: "text-on-surface-variant", dot: "bg-outline" },
  { key: "in_progress", label: "In Progress", chipBg: "bg-primary-fixed", chipText: "text-on-primary-fixed-variant", dot: "bg-primary" },
  { key: "in_review", label: "In Review", chipBg: "bg-tertiary-fixed", chipText: "text-on-tertiary-fixed-variant", dot: "bg-tertiary" },
  { key: "done", label: "Done", chipBg: "bg-success-container", chipText: "text-success", dot: "bg-success" },
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
