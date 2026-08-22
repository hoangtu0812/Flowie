'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { loadCurrentWorkspaceTeams } from '@/components/common/teams/team-types';
import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function HeaderNav() {
   const { orgId } = useParams<{ orgId: string }>();
   const [teamCount, setTeamCount] = useState<number>();

   useEffect(() => {
      void loadCurrentWorkspaceTeams()
         .then(({ teams }) => setTeamCount(teams.length))
         .catch(() => {});
   }, []);

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2">
            <SidebarTrigger className="" />
            <div className="flex items-center gap-1">
               <span className="text-sm font-medium">Teams</span>
               <span className="text-xs bg-accent rounded-md px-1.5 py-1">{teamCount ?? '…'}</span>
            </div>
         </div>
         <div className="flex items-center gap-2">
            <Button className="relative" size="xs" variant="secondary" asChild>
               <Link href={`/${orgId}/settings/teams/new`}>
                  <Plus className="size-4" />
                  Add team
               </Link>
            </Button>
         </div>
      </div>
   );
}
