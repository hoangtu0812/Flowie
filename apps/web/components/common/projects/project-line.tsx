'use client';

import { Project } from '@/types/projects';
import { useProjectsDisplayStore } from '@/store/projects-display-store';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { HealthPopover } from './health-popover';
import { PrioritySelector } from './priority-selector';
import { LeadSelector } from './lead-selector';
import { StatusWithPercent } from './status-with-percent';
import { DatePicker } from './date-picker';
import type { ProjectListMember, ProjectListStatus, ProjectListUpdate } from './projects';

interface ProjectLineProps {
   project: Project & { issueCount?: number };
   workspaceId?: string;
   workspaceMembers: ProjectListMember[];
   projectStatuses: ProjectListStatus[];
   onUpdateProject?: (projectId: string, update: ProjectListUpdate) => Promise<void>;
}

export default function ProjectLine({
   project,
   workspaceId,
   workspaceMembers,
   projectStatuses,
   onUpdateProject,
}: ProjectLineProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const { displayProperties } = useProjectsDisplayStore();
   const issueCount = project.issueCount ?? 0;

   return (
      <div className="w-full flex items-center py-3 px-6 border-b hover:bg-sidebar/50 border-muted-foreground/5 text-sm">
         <div className="flex-1 min-w-0 flex items-center gap-2">
            <div className="relative">
               <div className="inline-flex size-6 bg-muted/50 items-center justify-center rounded shrink-0">
                  <project.icon className="size-4" />
               </div>
            </div>
            <div className="flex flex-col items-start overflow-hidden">
               <Link
                  href={`/${orgId}/project/${project.id}/overview`}
                  className="font-medium truncate w-full hover:underline underline-offset-2"
               >
                  {project.name}
               </Link>
            </div>
            {displayProperties.labels &&
               project.labels.map((label) => (
                  <span
                     key={label.id}
                     className="hidden lg:inline-flex items-center gap-1 text-[11px] border rounded-full px-1.5 py-px text-muted-foreground shrink-0"
                  >
                     <span
                        className="size-1.5 rounded-full"
                        style={{ backgroundColor: label.color }}
                     />
                     {label.name}
                  </span>
               ))}
         </div>

         {displayProperties.health && (
            <div className="hidden sm:block w-[120px] shrink-0">
               <HealthPopover project={project} workspaceId={workspaceId} />
            </div>
         )}
         {displayProperties.priority && (
            <div className="hidden md:block w-[70px] shrink-0">
               <PrioritySelector
                  priority={project.priority}
                  disabled={!onUpdateProject}
                  onPriorityChange={
                     onUpdateProject
                        ? (priority) => onUpdateProject(project.id, { priority })
                        : undefined
                  }
               />
            </div>
         )}
         {displayProperties.lead && (
            <div className="hidden xl:block w-[130px] shrink-0">
               <LeadSelector
                  lead={project.lead}
                  members={workspaceMembers}
                  disabled={!onUpdateProject}
                  onLeadChange={
                     onUpdateProject
                        ? (leadId) => onUpdateProject(project.id, { leadId })
                        : undefined
                  }
               />
            </div>
         )}
         {displayProperties.targetDate && (
            <div className="hidden xl:block w-[110px] shrink-0">
               <DatePicker
                  date={project.targetDate ? new Date(project.targetDate) : undefined}
                  disabled={!onUpdateProject}
                  onDateChange={
                     onUpdateProject
                        ? (targetDate) =>
                             onUpdateProject(project.id, {
                                targetDate: targetDate ? targetDate.toISOString() : null,
                             })
                        : undefined
                  }
               />
            </div>
         )}
         {displayProperties.issues && (
            <div className="hidden xl:block w-[60px] shrink-0 text-muted-foreground text-xs pl-2.5">
               {issueCount}
            </div>
         )}
         {displayProperties.status && (
            <div className="w-[90px] shrink-0">
               <StatusWithPercent
                  status={project.status}
                  statuses={projectStatuses}
                  percentComplete={project.percentComplete}
                  disabled={!onUpdateProject}
                  onStatusChange={
                     onUpdateProject
                        ? (status) => onUpdateProject(project.id, { status })
                        : undefined
                  }
               />
            </div>
         )}
      </div>
   );
}
