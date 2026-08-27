import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type GroupingKey = 'status' | 'assignee' | 'priority' | 'project' | 'none';
export type OrderingKey = 'priority' | 'created' | 'title';
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

export const DISPLAY_PROPERTIES: { key: DisplayPropertyKey; label: string }[] = [
   { key: 'id', label: 'ID' },
   { key: 'status', label: 'Status' },
   { key: 'assignee', label: 'Assignee' },
   { key: 'priority', label: 'Priority' },
   { key: 'labels', label: 'Labels' },
   { key: 'project', label: 'Project' },
   { key: 'startDate', label: 'Start date' },
   { key: 'targetDate', label: 'End date' },
   { key: 'estimatedEffort', label: 'Est. effort' },
   { key: 'actualEffort', label: 'Act. effort' },
   { key: 'dueDate', label: 'Due date' },
   { key: 'created', label: 'Created' },
   { key: 'cycle', label: 'Cycle' },
];

const DEFAULT_DISPLAY_PROPERTIES: Record<DisplayPropertyKey, boolean> = {
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
   grouping: GroupingKey;
   ordering: OrderingKey;
   orderCompletedByRecency: boolean;
   completedIssues: CompletedIssuesFilter;
   showSubIssues: boolean;
   showEmptyGroups: boolean;
   displayProperties: Record<DisplayPropertyKey, boolean>;

   setGrouping: (grouping: GroupingKey) => void;
   setOrdering: (ordering: OrderingKey) => void;
   setOrderCompletedByRecency: (value: boolean) => void;
   setCompletedIssues: (value: CompletedIssuesFilter) => void;
   setShowSubIssues: (value: boolean) => void;
   setShowEmptyGroups: (value: boolean) => void;
   toggleDisplayProperty: (key: DisplayPropertyKey) => void;
   resetDisplaySettings: () => void;
}

const DEFAULTS = {
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
 * completed-issue visibility and per-row display properties.
 * Persisted to localStorage.
 */
export const useDisplaySettingsStore = create<DisplaySettingsState>()(
   persist(
      (set) => ({
         ...DEFAULTS,

         setGrouping: (grouping) => set({ grouping }),
         setOrdering: (ordering) => set({ ordering }),
         setOrderCompletedByRecency: (orderCompletedByRecency) => set({ orderCompletedByRecency }),
         setCompletedIssues: (completedIssues) => set({ completedIssues }),
         setShowSubIssues: (showSubIssues) => set({ showSubIssues }),
         setShowEmptyGroups: (showEmptyGroups) => set({ showEmptyGroups }),
         toggleDisplayProperty: (key) =>
            set((state) => ({
               displayProperties: {
                  ...state.displayProperties,
                  [key]: !state.displayProperties[key],
               },
            })),
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
