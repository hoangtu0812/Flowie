'use client';

import { useLiveTeam } from '@/features/teams/use-live-team';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ChevronRight, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

/**
 * Breadcrumb of a team's Views page. The team comes from the live API by the route's identifier
 * or id; until it loads, the route value stands in so the link still points at this team.
 * VI: Breadcrumb của trang Views của team. Team lấy từ API theo identifier hoặc id trên route;
 * VI: trong lúc chưa tải xong, dùng giá trị trên route để link vẫn trỏ đúng team này.
 */
export default function Header() {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const { team } = useLiveTeam(teamId);

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
            <span className="text-sm font-medium">Views</span>
            <Star className="size-3.5 text-muted-foreground shrink-0 ml-1" />
         </div>
      </div>
   );
}
