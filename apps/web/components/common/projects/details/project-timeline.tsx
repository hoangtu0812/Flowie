'use client';

import { LoadingState } from '@/components/common/loading-state';
import { useMemo } from 'react';
import { ProjectIssuesTimeline } from './project-issues-timeline';
import { toIssueUi, toProjectUi } from './project-detail-ui-adapter';
import { useLiveProjectData } from './use-live-project';

/** Project "Timeline" tab: the project's issues laid out over time. */
export default function ProjectTimeline({ projectId }: { projectId: string }) {
   void projectId;
   const { project: liveProject, issues: liveIssues, loading, error } = useLiveProjectData();

   const project = useMemo(
      () => (liveProject ? toProjectUi(liveProject, liveIssues) : null),
      [liveProject, liveIssues]
   );
   const issues = useMemo(
      () => (project ? liveIssues.map((issue) => toIssueUi(issue, project)) : []),
      [liveIssues, project]
   );

   if (loading) return <LoadingState label="Loading project…" />;
   if (error || !project)
      return (
         <div className="h-full grid place-items-center text-sm text-destructive">
            {error ?? 'Project not found.'}
         </div>
      );

   return <ProjectIssuesTimeline issues={issues} />;
}
