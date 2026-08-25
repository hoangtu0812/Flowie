'use client';

import { Button } from '@/components/ui/button';
import { CreateTeamDialog } from '@/components/common/teams/create-team-dialog';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useTeamsData } from '@/features/teams/teams-data';
import { Plus } from 'lucide-react';
import { useState } from 'react';

export default function HeaderNav() {
   const { teams } = useTeamsData();
   const [createOpen, setCreateOpen] = useState(false);
   return (
      <>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div className="flex items-center gap-2">
               <SidebarTrigger className="" />
               <div className="flex items-center gap-1">
                  <span className="text-sm font-medium">Teams</span>
                  <span className="text-xs bg-accent rounded-md px-1.5 py-1">{teams.length}</span>
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
                  Add team
               </Button>
            </div>
         </div>
         <CreateTeamDialog open={createOpen} onOpenChange={setCreateOpen} />
      </>
   );
}
