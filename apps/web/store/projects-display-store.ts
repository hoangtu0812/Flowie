import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/* Linear-style display settings for the Projects page (3 view types). */

export type ProjectsViewType = 'timeline' | 'board' | 'list';
export type ProjectsTab = 'all' | 'active';
export type ProjectsGrouping = 'team' | 'none';
export type ProjectsOrdering = 'start-date' | 'target-date' | 'title';
export type ClosedProjectsFilter = 'all' | 'hide';

export type ProjectDisplayPropertyKey =
   | 'milestones'
   | 'priority'
   | 'status'
   | 'health'
   | 'lead'
   | 'members'
   | 'targetDate'
   | 'issues'
   | 'labels';

export const PROJECT_DISPLAY_PROPERTIES: { key: ProjectDisplayPropertyKey; label: string }[] = [
   { key: 'milestones', label: 'Milestones' },
   { key: 'priority', label: 'Priority' },
   { key: 'status', label: 'Status' },
   { key: 'health', label: 'Health' },
   { key: 'lead', label: 'Lead' },
   { key: 'members', label: 'Members' },
   { key: 'targetDate', label: 'Target date' },
   { key: 'issues', label: 'Issues' },
   { key: 'labels', label: 'Labels' },
];

const DEFAULT_PROPERTIES: Record<ProjectDisplayPropertyKey, boolean> = {
   milestones: false,
   priority: true,
   status: true,
   health: true,
   lead: true,
   members: false,
   targetDate: true,
   issues: true,
   labels: false,
};

export interface ProjectsDisplaySettings {
   viewTypes: Record<ProjectsTab, ProjectsViewType>;
   grouping: ProjectsGrouping;
   ordering: ProjectsOrdering;
   closedProjects: ClosedProjectsFilter;
   showEmptyGroups: boolean;
   showProjectList: boolean;
   showWeekNumbers: boolean;
   displayProperties: Record<ProjectDisplayPropertyKey, boolean>;
}

interface ProjectsDisplayState extends ProjectsDisplaySettings {
   /** View type per tab — All projects defaults to list, Active to timeline. */
   viewTypes: Record<ProjectsTab, ProjectsViewType>;
   grouping: ProjectsGrouping;
   ordering: ProjectsOrdering;
   closedProjects: ClosedProjectsFilter;
   /** List/board: render groups (columns) with no project. */
   showEmptyGroups: boolean;
   /** Timeline: show the sticky project list on the left. */
   showProjectList: boolean;
   /** Timeline: show week-start day numbers under the month scale. */
   showWeekNumbers: boolean;
   displayProperties: Record<ProjectDisplayPropertyKey, boolean>;
   workspaceDefaultsId?: string;
   workspaceDefaultsUpdatedAt?: string;

   setViewType: (tab: ProjectsTab, viewType: ProjectsViewType) => void;
   setGrouping: (grouping: ProjectsGrouping) => void;
   setOrdering: (ordering: ProjectsOrdering) => void;
   setClosedProjects: (value: ClosedProjectsFilter) => void;
   setShowEmptyGroups: (value: boolean) => void;
   setShowProjectList: (value: boolean) => void;
   setShowWeekNumbers: (value: boolean) => void;
   toggleDisplayProperty: (key: ProjectDisplayPropertyKey) => void;
   resetDisplaySettings: () => void;
   applyWorkspaceDefaults: (
      workspaceId: string,
      updatedAt: string,
      settings: ProjectsDisplaySettings
   ) => void;
}

const DEFAULTS = {
   viewTypes: { all: 'list', active: 'timeline' } as Record<ProjectsTab, ProjectsViewType>,
   grouping: 'team' as ProjectsGrouping,
   ordering: 'start-date' as ProjectsOrdering,
   closedProjects: 'all' as ClosedProjectsFilter,
   showEmptyGroups: false,
   showProjectList: true,
   showWeekNumbers: false,
   displayProperties: DEFAULT_PROPERTIES,
};

export const useProjectsDisplayStore = create<ProjectsDisplayState>()(
   persist(
      (set) => ({
         ...DEFAULTS,

         setViewType: (tab, viewType) =>
            set((state) => ({ viewTypes: { ...state.viewTypes, [tab]: viewType } })),
         setGrouping: (grouping) => set({ grouping }),
         setOrdering: (ordering) => set({ ordering }),
         setClosedProjects: (closedProjects) => set({ closedProjects }),
         setShowEmptyGroups: (showEmptyGroups) => set({ showEmptyGroups }),
         setShowProjectList: (showProjectList) => set({ showProjectList }),
         setShowWeekNumbers: (showWeekNumbers) => set({ showWeekNumbers }),
         toggleDisplayProperty: (key) =>
            set((state) => ({
               displayProperties: {
                  ...state.displayProperties,
                  [key]: !state.displayProperties[key],
               },
            })),
         resetDisplaySettings: () => set({ ...DEFAULTS }),
         applyWorkspaceDefaults: (workspaceId, updatedAt, settings) =>
            set((state) => {
               const remoteTimestamp = Date.parse(updatedAt);
               const localTimestamp = Date.parse(state.workspaceDefaultsUpdatedAt ?? '');
               const shouldApply =
                  state.workspaceDefaultsId !== workspaceId ||
                  Number.isNaN(localTimestamp) ||
                  remoteTimestamp > localTimestamp;
               if (!shouldApply) return state;
               return {
                  ...settings,
                  workspaceDefaultsId: workspaceId,
                  workspaceDefaultsUpdatedAt: updatedAt,
               };
            }),
      }),
      {
         name: 'projects-display-settings-v2',
         storage: createJSONStorage(() => localStorage),
      }
   )
);
