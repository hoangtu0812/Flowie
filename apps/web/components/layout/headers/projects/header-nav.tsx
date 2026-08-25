'use client';

import { Button } from '@/components/ui/button';
import { CreateProjectDialog } from '@/components/common/projects/create-project-dialog';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useProjectsData } from '@/features/projects/projects-data';
import { Plus } from 'lucide-react';
import { useState } from 'react';

export default function HeaderNav() {
   const { allProjects } = useProjectsData();
   const [createOpen, setCreateOpen] = useState(false);
   return (
      <>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div className="flex items-center gap-2">
               <SidebarTrigger className="" />
               <div className="flex items-center gap-1">
                  <span className="text-sm font-medium">Projects</span>
                  <span className="text-xs bg-accent rounded-md px-1.5 py-1">
                     {allProjects.length}
                  </span>
               </div>
            </div>
            <div className="flex items-center gap-2">
               <Button
                  className="relative"
                  size="xs"
                  variant="secondary"
                  onClick={() => setCreateOpen(true)}
               >
                  <Plus className="size-4" />
                  <span className="hidden sm:inline ml-1">Create project</span>
               </Button>
            </div>
         </div>
         <CreateProjectDialog open={createOpen} onOpenChange={setCreateOpen} />
      </>
   );
}
