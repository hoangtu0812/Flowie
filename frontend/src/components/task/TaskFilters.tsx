"use client";

import { useMemo } from "react";
import { HStack } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { Button } from "@astryxdesign/core/Button";
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

  return (
    <HStack gap={2} vAlign="center" wrap="wrap">
      <Selector
        label="Người phụ trách"
        isLabelHidden
        size="sm"
        value={filters.assignee}
        onChange={(v) => set({ assignee: v ?? "" })}
        placeholder="Mọi người"
        options={[
          { value: "", label: "Mọi người" },
          { value: "none", label: "Chưa gán" },
          ...members.map((m) => ({ value: m.userId, label: m.displayName || m.email })),
        ]}
      />

      <Selector
        label="Độ ưu tiên"
        isLabelHidden
        size="sm"
        value={filters.priority}
        onChange={(v) => set({ priority: v ?? "" })}
        placeholder="Mọi ưu tiên"
        options={[
          { value: "", label: "Mọi ưu tiên" },
          { value: "urgent", label: "Urgent" },
          { value: "high", label: "High" },
          { value: "medium", label: "Medium" },
          { value: "low", label: "Low" },
        ]}
      />

      {labels.length > 0 && (
        <Selector
          label="Nhãn"
          isLabelHidden
          size="sm"
          value={filters.label}
          onChange={(v) => set({ label: v ?? "" })}
          placeholder="Mọi nhãn"
          options={[
            { value: "", label: "Mọi nhãn" },
            ...labels.map((l) => ({ value: l.id, label: l.name })),
          ]}
        />
      )}

      <Selector
        label="MoSCoW"
        isLabelHidden
        size="sm"
        value={filters.moscow}
        onChange={(v) => set({ moscow: v ?? "" })}
        placeholder="Mọi MoSCoW"
        options={[
          { value: "", label: "Mọi MoSCoW" },
          { value: "must", label: "Must" },
          { value: "should", label: "Should" },
          { value: "could", label: "Could" },
          { value: "wont", label: "Won't" },
        ]}
      />

      <ToggleButton
        label="Quá hạn"
        size="sm"
        icon={<Icon name="event_busy" size={16} />}
        isPressed={filters.overdue}
        onPressedChange={(v) => set({ overdue: v })}
      />

      <ToggleButton
        label="Ẩn việc xong"
        size="sm"
        icon={<Icon name="check_circle" size={16} />}
        isPressed={filters.hideDone}
        onPressedChange={(v) => set({ hideDone: v })}
      />

      <Selector
        label="Sắp xếp"
        isLabelHidden
        size="sm"
        value={sort}
        onChange={(v) => setSort((v ?? "position") as SortKey)}
        options={[
          { value: "position", label: "Thứ tự thủ công" },
          { value: "due", label: "Hạn gần nhất" },
          { value: "priority", label: "Ưu tiên cao trước" },
          { value: "points", label: "Story points" },
          { value: "rice", label: "Điểm RICE" },
          { value: "title", label: "Tên A→Z" },
        ]}
      />

      <Selector
        label="Nhóm thành các làn"
        isLabelHidden
        size="sm"
        value={group}
        onChange={(v) => setGroup(v ?? "status")}
        options={[
          { value: "status", label: "Nhóm: Trạng thái" },
          { value: "assignee", label: "Nhóm: Người phụ trách" },
          { value: "priority", label: "Nhóm: Ưu tiên" },
          { value: "moscow", label: "Nhóm: MoSCoW" },
          { value: "none", label: "Không nhóm" },
        ]}
      />

      {active && (
        <Button
          label={`Xoá lọc (${resultCount})`}
          variant="ghost"
          size="sm"
          icon={<Icon name="close" size={16} />}
          onClick={() => setFilters(EMPTY_FILTERS)}
        />
      )}
    </HStack>
  );
}
