import {
   toggleColumnSort,
   type ColumnSort,
   type ColumnSortKey,
} from '@/features/issues/column-sorting';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type GroupingKey = 'status' | 'assignee' | 'priority' | 'project' | 'none';
export type OrderingKey = 'priority' | 'created' | 'title' | 'manual';
export type CompletedIssuesFilter = 'all' | 'none';

export type DisplayPropertyKey =
   | 'id'
   | 'status'
   | 'priority'
   | 'assignee'
   | 'labels'
   | 'project'
   | 'startDate'
   | 'targetDate'
   | 'estimatedEffort'
   | 'actualEffort'
   | 'dueDate'
   | 'created'
   | 'cycle';

export const DEFAULT_DISPLAY_PROPERTIES: Record<DisplayPropertyKey, boolean> = {
   id: true,
   status: true,
   priority: true,
   assignee: true,
   labels: true,
   project: true,
   startDate: true,
   targetDate: true,
   estimatedEffort: true,
   actualEffort: true,
   dueDate: true,
   created: true,
   cycle: false,
};

interface DisplaySettingsState {
   columnSorts: ColumnSort[];
   toggleColumnSort: (key: ColumnSortKey, additive: boolean) => void;
   grouping: GroupingKey;
   ordering: OrderingKey;
   orderCompletedByRecency: boolean;
   completedIssues: CompletedIssuesFilter;
   showSubIssues: boolean;
   showEmptyGroups: boolean;
   /**
    * Per-browser visibility from before columns were stored per account. Only
    * read as the starting point until the account saves its own columns
    * (`useIssueColumns`); nothing writes it any more.
    * VI: Trạng thái ẩn/hiện theo trình duyệt từ trước khi cột được lưu theo tài
    * khoản. Chỉ được đọc làm điểm khởi đầu cho tới khi tài khoản lưu cột của
    * mình (`useIssueColumns`); không còn nơi nào ghi vào.
    */
   displayProperties: Record<DisplayPropertyKey, boolean>;

   setGrouping: (grouping: GroupingKey) => void;
   setOrdering: (ordering: OrderingKey) => void;
   setOrderCompletedByRecency: (value: boolean) => void;
   setCompletedIssues: (value: CompletedIssuesFilter) => void;
   setShowSubIssues: (value: boolean) => void;
   setShowEmptyGroups: (value: boolean) => void;
   resetDisplaySettings: () => void;
}

const DEFAULTS = {
   columnSorts: [] as ColumnSort[],
   grouping: 'status' as GroupingKey,
   ordering: 'priority' as OrderingKey,
   orderCompletedByRecency: false,
   completedIssues: 'all' as CompletedIssuesFilter,
   showSubIssues: true,
   showEmptyGroups: false,
   displayProperties: DEFAULT_DISPLAY_PROPERTIES,
};

/**
 * View display settings (Linear's "Display" popover): grouping, ordering,
 * completed-issue visibility and sort columns, persisted to localStorage.
 * Column visibility, order and widths are per account (`useIssueColumns`).
 * VI: Thiết lập hiển thị của view: grouping, ordering, ẩn/hiện issue đã xong và
 * sort cột, lưu trong localStorage. Ẩn/hiện, thứ tự và độ rộng cột lưu theo tài
 * khoản (`useIssueColumns`).
 */
export const useDisplaySettingsStore = create<DisplaySettingsState>()(
   persist(
      (set) => ({
         ...DEFAULTS,
         toggleColumnSort: (key, additive) =>
            set((state) => ({
               columnSorts: toggleColumnSort(state.columnSorts ?? [], key, additive),
            })),

         setGrouping: (grouping) => set({ grouping }),
         setOrdering: (ordering) => set({ ordering }),
         setOrderCompletedByRecency: (orderCompletedByRecency) => set({ orderCompletedByRecency }),
         setCompletedIssues: (completedIssues) => set({ completedIssues }),
         setShowSubIssues: (showSubIssues) => set({ showSubIssues }),
         setShowEmptyGroups: (showEmptyGroups) => set({ showEmptyGroups }),
         resetDisplaySettings: () => set({ ...DEFAULTS }),
      }),
      {
         name: 'display-settings',
         storage: createJSONStorage(() => localStorage),
         version: 3,
         // Keep a user's visibility choice when the combined schedule and
         // effort columns are promoted to independently configurable fields.
         migrate: (persisted, version) => {
            const state = persisted as Partial<DisplaySettingsState> | undefined;
            if (!state || version >= 3) return state as DisplaySettingsState;
            const legacyProperties = state.displayProperties as Record<string, boolean> | undefined;
            return {
               ...state,
               displayProperties: {
                  ...DEFAULT_DISPLAY_PROPERTIES,
                  ...legacyProperties,
                  dueDate: true,
                  startDate: legacyProperties?.schedule ?? true,
                  targetDate: legacyProperties?.schedule ?? true,
                  estimatedEffort: legacyProperties?.effort ?? true,
                  actualEffort: legacyProperties?.effort ?? true,
               },
            } as DisplaySettingsState;
         },
      }
   )
);
