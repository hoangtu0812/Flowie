'use client';

import type { Project } from '@/types/projects';
import { useProjectsData } from '@/features/projects/projects-data';
import { useProjectsDisplayStore } from '@/store/projects-display-store';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { HealthPopover } from './health-popover';
import { PrioritySelector } from './priority-selector';
import { LeadSelector } from './lead-selector';
import { StatusWithPercent } from './status-with-percent';
import { DatePicker } from './date-picker';
import { toast } from 'sonner';

interface ProjectLineProps {
   project: Project & { issueCount?: number };
}

export default function ProjectLine({ project }: ProjectLineProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const { updateProject, workspaceMembers } = useProjectsData();
   const { displayProperties } = useProjectsDisplayStore();
   const persistUpdate = (update: Parameters<typeof updateProject>[1]) => {
      void updateProject(project.id, update).catch((error: unknown) => {
         toast.error(error instanceof Error ? error.message : 'Could not update project.');
      });
   };

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
               <HealthPopover
                  project={project}
                  onHealthChange={(health) => persistUpdate({ health })}
               />
            </div>
         )}
         {displayProperties.priority && (
            <div className="hidden md:block w-[70px] shrink-0">
               <PrioritySelector
                  priority={project.priority}
                  onPriorityChange={(priority) => persistUpdate({ priority })}
               />
            </div>
         )}
         {displayProperties.lead && (
            <div className="hidden xl:block w-[130px] shrink-0">
               <LeadSelector
                  lead={project.lead}
                  members={workspaceMembers}
                  onLeadChange={(leadId) => persistUpdate({ leadId })}
               />
            </div>
         )}
         {displayProperties.targetDate && (
            <div className="hidden xl:block w-[110px] shrink-0">
               <DatePicker
                  date={project.targetDate ? new Date(project.targetDate) : undefined}
                  onDateChange={(date) =>
                     persistUpdate({ targetDate: date?.toISOString() ?? null })
                  }
               />
            </div>
         )}
         {displayProperties.issues && (
            <div className="hidden xl:block w-[60px] shrink-0 text-muted-foreground text-xs pl-2.5">
               {project.issueCount ?? 0}
            </div>
         )}
         {displayProperties.status && (
            <div className="w-[90px] shrink-0">
               <StatusWithPercent
                  status={project.status}
                  percentComplete={project.percentComplete}
                  onStatusChange={(status) => persistUpdate({ status })}
               />
            </div>
         )}
      </div>
   );
}
