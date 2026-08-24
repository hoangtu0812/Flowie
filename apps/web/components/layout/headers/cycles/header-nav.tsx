'use client';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { loadJoinedWorkspaceTeams, WorkspaceTeam } from '@/components/common/teams/team-types';
import { ChevronRight, Plus, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function HeaderNav() {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const [team, setTeam] = useState<WorkspaceTeam>();

   useEffect(() => {
      void loadJoinedWorkspaceTeams()
         .then(({ teams }) =>
            setTeam(
               teams.find(
                  (item) =>
                     item.id === teamId || item.identifier.toLowerCase() === teamId.toLowerCase()
               )
            )
         )
         .catch(() => setTeam(undefined));
   }, [teamId]);

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger />
            <Link
               href={`/${orgId}/team/${team?.identifier ?? teamId}/overview`}
               className="flex items-center gap-1.5 min-w-0 hover:opacity-80"
            >
               <div className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0 text-xs">
                  {team?.icon ?? '👥'}
               </div>
               <span className="text-sm font-medium truncate">{team?.name ?? teamId}</span>
            </Link>
            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">Cycles</span>
            <Star className="size-3.5 text-muted-foreground shrink-0 ml-1" />
         </div>
         <Button
            type="button"
            size="xs"
            variant="secondary"
            onClick={() => window.dispatchEvent(new Event('flowie:create-cycle'))}
         >
            <Plus className="size-4" />
            New cycle
         </Button>
      </div>
   );
}
