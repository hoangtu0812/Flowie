'use client';

import { useLiveTeam } from '@/components/common/teams/use-live-team';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Link2, MoreHorizontal, Star } from 'lucide-react';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

export default function HeaderNav() {
   const { teamId } = useParams<{ teamId: string }>();
   const { team } = useLiveTeam(teamId);
   const copyLink = async () => {
      try { await navigator.clipboard.writeText(window.location.href); toast.success('Team link copied.'); }
      catch { toast.error('Could not copy team link.'); }
   };

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2 min-w-0"><SidebarTrigger /><div className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0 text-xs">{team?.icon ?? '👥'}</div><span className="text-sm font-medium truncate">{team?.name ?? 'Team'}</span><Star className="size-3.5 text-muted-foreground shrink-0 ml-1" /><MoreHorizontal className="size-3.5 text-muted-foreground shrink-0" /></div>
         <button type="button" onClick={() => void copyLink()} className="text-muted-foreground hover:text-foreground" aria-label="Copy team link"><Link2 className="size-4 shrink-0" /></button>
      </div>
   );
}
