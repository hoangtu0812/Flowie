'use client';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { useLiveCycle } from '@/components/common/cycles/use-live-cycle';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ChevronRight, MoreHorizontal, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { CycleView } from '@/components/common/issues/cycle-issues';

export default function HeaderNav({ cycleView }: { cycleView: CycleView }) {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const { team, cycle } = useLiveCycle(cycleView);

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
            <Link
               href={`/${orgId}/team/${team?.identifier ?? teamId}/cycles`}
               className="text-sm font-medium text-muted-foreground hover:text-foreground"
            >
               Cycles
            </Link>
            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
            <div className="flex items-center gap-1.5 min-w-0">
               <CyclePlayIcon className="size-3.5" />
               <span className="text-sm font-medium truncate">{cycle?.name ?? 'Cycle'}</span>
            </div>
            <Star className="size-3.5 text-muted-foreground shrink-0 ml-1" />
            <MoreHorizontal className="size-3.5 text-muted-foreground shrink-0" />
         </div>
      </div>
   );
}
