'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTeamsDisplayStore } from '@/store/teams-display-store';
import { Box, Check, Play } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { ApiTeam } from './team-types';

interface TeamLineProps {
   team: ApiTeam;
}

const dateLabel = (value: string) =>
   new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(
      new Date(value)
   );

export default function TeamLine({ team }: TeamLineProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const { displayProperties } = useTeamsDisplayStore();
   const owner = team.members.find((member) => member.role === 'LEAD')?.user;

   return (
      <Link
         href={`/${orgId}/team/${team.id}/all`}
         className="w-full flex items-center py-2.5 px-6 border-b hover:bg-sidebar/50 border-muted-foreground/5 text-sm"
      >
         {/* Name + identifier */}
         <div className="flex-1 min-w-0 flex items-center gap-2.5">
            <span className="inline-flex size-6 bg-muted/50 items-center justify-center rounded shrink-0 text-sm">
               {team.icon ?? '👥'}
            </span>
            <span className="font-medium truncate">{team.name}</span>
            <span className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">
               {team.identifier}
            </span>
         </div>

         {displayProperties.membership && (
            <div className="hidden sm:block w-[110px] shrink-0">
               <span className="inline-flex items-center gap-1 text-xs border rounded-md px-1.5 py-0.5 text-muted-foreground">
                  <Check className="size-3" />
                  Joined
               </span>
            </div>
         )}

         {displayProperties.owners && (
            <div className="hidden lg:block w-[70px] shrink-0">
               {owner && (
                  <Avatar className="size-5">
                     <AvatarImage src={owner.avatarUrl ?? undefined} alt={owner.name} />
                     <AvatarFallback>{owner.name[0]}</AvatarFallback>
                  </Avatar>
               )}
            </div>
         )}

         {displayProperties.members && (
            <div className="w-[150px] shrink-0 flex items-center gap-1.5">
               {team.members.length > 0 && (
                  <>
                     <span className="flex -space-x-1.5">
                        {team.members.slice(0, 6).map(({ user }) => (
                           <Avatar key={user.id} className="size-5 border-2 border-container">
                              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
                              <AvatarFallback>{user.name[0]}</AvatarFallback>
                           </Avatar>
                        ))}
                     </span>
                     <span className="text-xs text-muted-foreground">{team.members.length}</span>
                  </>
               )}
            </div>
         )}

         {displayProperties.cycle && (
            <div className="hidden md:flex w-[80px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
               {team._count.cycles > 0 && (
                  <>
                     <Play className="size-3.5" />
                     {team._count.cycles}
                  </>
               )}
            </div>
         )}

         {displayProperties.projects && (
            <div className="hidden sm:flex w-[80px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
               <Box className="size-3.5" />
               {team._count.projects}
            </div>
         )}

         {displayProperties.created && (
            <div className="hidden xl:block w-[90px] shrink-0 text-xs text-muted-foreground">
               {dateLabel(team.createdAt)}
            </div>
         )}

         {displayProperties.updated && (
            <div className="hidden xl:block w-[90px] shrink-0 text-xs text-muted-foreground">
               {dateLabel(team.updatedAt)}
            </div>
         )}
      </Link>
   );
}
