"use client";

import { useMemo } from "react";
import { Member } from "@/lib/api";
import Icon from "../ui/Icon";
import {
  EMPTY_FILTERS,
  FilterState,
  SortKey,
  hasActiveFilters,
} from "@/lib/taskFilters";

// Filter/sort logic lives in @/lib/taskFilters so it stays testable without
// React; re-exported here for the call sites that already import from this file.
export {
  EMPTY_FILTERS,
  applyFilters,
  hasActiveFilters,
  groupTasks,
} from "@/lib/taskFilters";
export type { FilterState, SortKey, GroupKey, TaskGroup } from "@/lib/taskFilters";

export default function TaskFilters({
  filters,
  setFilters,
  sort,
  setSort,
  group,
  setGroup,
  members,
  labels,
  resultCount,
}: {
  filters: FilterState;
  setFilters: (f: FilterState) => void;
  sort: SortKey;
  setSort: (s: SortKey) => void;
  group: string;
  setGroup: (g: string) => void;
  members: Member[];
  labels: { id: string; name: string }[];
  resultCount: number;
}) {
  const active = useMemo(() => hasActiveFilters(filters), [filters]);
  const set = (patch: Partial<FilterState>) => setFilters({ ...filters, ...patch });

  const selectCls =
    "bg-white border border-gray-200 rounded-full px-3 py-1.5 text-[13px] font-semibold text-gray-700 shadow-sm";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={selectCls}
        value={filters.assignee}
        onChange={(e) => set({ assignee: e.target.value })}
        title="Lọc theo người phụ trách"
      >
        <option value="">Mọi người</option>
        <option value="none">Chưa gán</option>
        {members.map((m) => (
          <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
        ))}
      </select>

      <select
        className={selectCls}
        value={filters.priority}
        onChange={(e) => set({ priority: e.target.value })}
        title="Lọc theo độ ưu tiên"
      >
        <option value="">Mọi ưu tiên</option>
        <option value="urgent">Urgent</option>
        <option value="high">High</option>
        <option value="medium">Medium</option>
        <option value="low">Low</option>
      </select>

      {labels.length > 0 && (
        <select
          className={selectCls}
          value={filters.label}
          onChange={(e) => set({ label: e.target.value })}
          title="Lọc theo nhãn"
        >
          <option value="">Mọi nhãn</option>
          {labels.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      )}

      <select
        className={selectCls}
        value={filters.moscow}
        onChange={(e) => set({ moscow: e.target.value })}
        title="Lọc theo MoSCoW"
      >
        <option value="">Mọi MoSCoW</option>
        <option value="must">Must</option>
        <option value="should">Should</option>
        <option value="could">Could</option>
        <option value="wont">Won&apos;t</option>
      </select>

      <button
        onClick={() => set({ overdue: !filters.overdue })}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold shadow-sm border transition-colors ${
          filters.overdue
            ? "bg-red-50 border-red-200 text-red-600"
            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}
      >
        <Icon name="event_busy" size={16} /> Quá hạn
      </button>

      <button
        onClick={() => set({ hideDone: !filters.hideDone })}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold shadow-sm border transition-colors ${
          filters.hideDone
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
        }`}
      >
        <Icon name="check_circle" size={16} /> Ẩn việc xong
      </button>

      <select
        className={selectCls}
        value={sort}
        onChange={(e) => setSort(e.target.value as SortKey)}
        title="Sắp xếp"
      >
        <option value="position">Thứ tự thủ công</option>
        <option value="due">Hạn gần nhất</option>
        <option value="priority">Ưu tiên cao trước</option>
        <option value="points">Story points</option>
        <option value="rice">Điểm RICE</option>
        <option value="title">Tên A→Z</option>
      </select>

      <select
        className={selectCls}
        value={group}
        onChange={(e) => setGroup(e.target.value)}
        title="Nhóm thành các làn (swimlane)"
      >
        <option value="status">Nhóm: Trạng thái</option>
        <option value="assignee">Nhóm: Người phụ trách</option>
        <option value="priority">Nhóm: Ưu tiên</option>
        <option value="moscow">Nhóm: MoSCoW</option>
        <option value="none">Không nhóm</option>
      </select>

      {active && (
        <button
          onClick={() => setFilters(EMPTY_FILTERS)}
          className="flex items-center gap-1 px-3 py-1.5 text-[13px] font-semibold text-gray-500 hover:text-gray-900"
        >
          <Icon name="close" size={16} /> Xoá lọc ({resultCount})
        </button>
      )}
    </div>
  );
}
