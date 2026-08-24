'use client';

import { InsightsPanel } from '@/components/common/issues/insights-panel';
import { ProjectDetail } from '@/mock-data/project-details';
import { useRightPanelStore } from '@/store/right-panel-store';
import type { ProjectDetailUiIssue, ProjectDetailUiProject } from './project-detail-ui-adapter';
import { ProjectPropertiesPanel } from './project-properties-panel';
import type { LiveProjectLabel } from './use-live-project';

interface ProjectSidePanelProps {
   project: ProjectDetailUiProject;
   detail: ProjectDetail;
   issues: ProjectDetailUiIssue[];
   /** Issues shown by the insights panel (e.g. after filters); defaults to `issues`. */
   insightsIssues?: ProjectDetailUiIssue[];
   availableLabels?: LiveProjectLabel[];
   onLabelsChange?: (labelIds: string[]) => Promise<void>;
   onCreateMilestone?: (title: string, targetDate?: string) => Promise<unknown>;
   onToggleMilestone?: (milestoneId: string, completed: boolean) => Promise<void>;
}

/**
 * Right panel of the project pages. Properties are shown by default;
 * the header icons switch to the insights panel or collapse it entirely
 * (right-panel-store: null = properties, 'insights', 'hidden').
 */
export function ProjectSidePanel({
   project,
   detail,
   issues,
   insightsIssues,
   availableLabels = [],
   onLabelsChange,
   onCreateMilestone,
   onToggleMilestone,
}: ProjectSidePanelProps) {
   const { openPanel } = useRightPanelStore();

   if (openPanel === 'hidden') return null;

   return (
      <aside className="hidden xl:flex w-[380px] shrink-0 border-l h-full overflow-hidden bg-container">
         {openPanel === 'insights' ? (
            <InsightsPanel issues={insightsIssues ?? issues} />
         ) : (
            <ProjectPropertiesPanel
               project={project}
               detail={detail}
               issues={issues}
               availableLabels={availableLabels}
               onLabelsChange={onLabelsChange}
               onCreateMilestone={onCreateMilestone}
               onToggleMilestone={onToggleMilestone}
            />
         )}
      </aside>
   );
}
