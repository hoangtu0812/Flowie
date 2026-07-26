// Pure filter/sort logic for task lists.
//
// Kept free of React and of runtime imports (only `import type`) so it can be
// executed directly by `node --experimental-strip-types` in tests — the tests
// therefore exercise this exact code, not a copy.

import type { Task } from "@/types/models";

export interface FilterState {
  assignee: string; // "" = all, "none" = unassigned
  priority: string; // "" = all
  label: string; // label id, "" = all
  moscow: string; // "" = all
  overdue: boolean;
  hideDone: boolean;
}

export type SortKey = "position" | "due" | "priority" | "title" | "points" | "rice";

/** How the board splits rows into groups (swimlanes). */
export type GroupKey = "status" | "assignee" | "priority" | "moscow" | "none";

export interface TaskGroup {
  key: string;
  label: string;
  tasks: Task[];
}

/**
 * Splits tasks into swimlanes. `status` grouping is handled by the board's own
 * column rendering, so it is not produced here.
 *
 * Names come from `labelFor` so the caller can resolve user ids to display
 * names without this module depending on the member list.
 */
export function groupTasks(
  tasks: Task[],
  group: GroupKey,
  labelFor: (key: string) => string,
): TaskGroup[] {
  if (group === "none" || group === "status") {
    return [{ key: "all", label: "", tasks }];
  }

  const buckets = new Map<string, Task[]>();
  for (const t of tasks) {
    let key: string;
    switch (group) {
      case "assignee":
        key = t.assigneeId ?? "unassigned";
        break;
      case "priority":
        key = t.priority || "none";
        break;
      case "moscow":
        key = t.moscow || "none";
        break;
      default:
        key = "all";
    }
    const list = buckets.get(key);
    if (list) list.push(t);
    else buckets.set(key, [t]);
  }

  const out: TaskGroup[] = [];
  for (const [key, list] of buckets) {
    out.push({ key, label: labelFor(key), tasks: list });
  }
  // Largest group first so the busiest lane is immediately visible.
  out.sort((a, b) => b.tasks.length - a.tasks.length);
  return out;
}

export const EMPTY_FILTERS: FilterState = {
  assignee: "",
  priority: "",
  label: "",
  moscow: "",
  overdue: false,
  hideDone: false,
};

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/** True when any filter deviates from the default. */
export function hasActiveFilters(f: FilterState): boolean {
  return (
    f.assignee !== "" ||
    f.priority !== "" ||
    f.label !== "" ||
    f.moscow !== "" ||
    f.overdue ||
    f.hideDone
  );
}

/** Applies filters, then sorting. */
export function applyFilters(
  tasks: Task[],
  f: FilterState,
  sort: SortKey,
  query: string,
): Task[] {
  const today = new Date().toISOString().slice(0, 10);
  const q = query.trim().toLowerCase();

  const out = tasks.filter((t) => {
    if (q && !t.title.toLowerCase().includes(q)) return false;
    if (f.assignee === "none" && t.assigneeId) return false;
    if (f.assignee && f.assignee !== "none" && t.assigneeId !== f.assignee) return false;
    if (f.priority && t.priority !== f.priority) return false;
    if (f.moscow && t.moscow !== f.moscow) return false;
    if (f.label && !(t.labels ?? []).some((l) => l.id === f.label)) return false;
    if (f.hideDone && t.status === "done") return false;
    if (f.overdue) {
      const due = t.dueDate?.slice(0, 10);
      // Overdue means: has a past due date and is not already finished.
      if (!due || due >= today || t.status === "done") return false;
    }
    return true;
  });

  const sorted = [...out];
  switch (sort) {
    case "due":
      // Undated tasks sink to the bottom instead of sorting as "oldest".
      sorted.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
      break;
    case "priority":
      sorted.sort(
        (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9),
      );
      break;
    case "title":
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "points":
      sorted.sort((a, b) => (b.storyPoints ?? -1) - (a.storyPoints ?? -1));
      break;
    case "rice":
      sorted.sort((a, b) => (b.riceScore ?? -1) - (a.riceScore ?? -1));
      break;
    default:
      break; // keep the board's manual ordering
  }
  return sorted;
}
