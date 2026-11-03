'use client';

import { useProjectsDisplayStore } from '@/store/projects-display-store';
import ProjectLine from './project-line';
import { ProjectGroup } from './projects';
import { useProjectsData } from '@/features/projects/projects-data';
import { useEffect, useState } from 'react';
import { moveInList } from '@/features/manual-order/order';
import { ReorderRow, ReorderProvider } from '@/features/manual-order/reorder-row';

/** Projects "List" view: grouped table (team sections by default). */
export default function ProjectsList({ groups }: { groups: ProjectGroup[] }) {
   const { grouping, displayProperties, ordering } = useProjectsDisplayStore();
   const { workspaceId, refreshProjects } = useProjectsData();

   return (
      <div className="w-full h-full overflow-y-auto">
         <div className="bg-container px-6 h-8 text-xs font-medium flex items-center text-muted-foreground border-b border-border/60 sticky top-0 z-10">
            <div className="flex-1 min-w-0">Name</div>
            {displayProperties.health && (
               <div className="hidden sm:block w-[120px] shrink-0 pl-2">Health</div>
            )}
            {displayProperties.priority && (
               <div className="hidden md:block w-[70px] shrink-0 pl-2">Priority</div>
            )}
            {displayProperties.lead && (
               <div className="hidden xl:block w-[130px] shrink-0 pl-2">Lead</div>
            )}
            {displayProperties.targetDate && (
               <div className="hidden xl:block w-[110px] shrink-0 pl-2.5">Target date</div>
            )}
            {displayProperties.issues && (
               <div className="hidden xl:block w-[60px] shrink-0 pl-2.5">Issues</div>
            )}
            {displayProperties.status && <div className="w-[90px] shrink-0 pl-2">Status</div>}
         </div>

         {groups.map((group) => (
            <div key={group.id}>
               {grouping !== 'none' && (
                  <div className="flex items-center gap-2 px-6 h-8 text-xs font-medium bg-container border-b border-border/50 sticky top-8 z-[9]">
                     {group.icon && <span>{group.icon}</span>}
                     {group.name}
                     <span className="text-xs text-muted-foreground">{group.projects.length}</span>
                  </div>
               )}
               <ProjectRows
                  group={group}
                  workspaceId={workspaceId}
                  enabled={ordering === 'manual'}
                  refresh={refreshProjects}
               />
               {group.projects.length === 0 && (
                  <div className="px-6 py-3 text-xs text-muted-foreground border-b border-border/40">
                     No projects
                  </div>
               )}
            </div>
         ))}
      </div>
   );
}

function ProjectRows({
   group,
   workspaceId,
   enabled,
   refresh,
}: {
   group: ProjectGroup;
   workspaceId?: string;
   enabled: boolean;
   refresh: () => Promise<void>;
}) {
   const [items, setItems] = useState(group.projects);
   useEffect(() => setItems(group.projects), [group.projects]);
   return (
      <ReorderProvider>
         {items.map((project) => (
            <ReorderRow
               key={project.id}
               item={project}
               items={items}
               name={project.name}
               entityType="project"
               scope={`project:${workspaceId}:${group.id}`}
               workspaceId={workspaceId}
               enabled={enabled}
               optimistic={(source, target, placement) =>
                  setItems((current) => moveInList(current, source, target, placement))
               }
               refresh={refresh}
            >
               <ProjectLine project={project} />
            </ReorderRow>
         ))}
      </ReorderProvider>
   );
}
