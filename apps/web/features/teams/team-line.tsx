'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import type { WorkspaceTeam } from './team-types';
import { useTeamsDisplayStore } from '@/store/teams-display-store';
import { Box, Check, Play } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface TeamLineProps {
   team: WorkspaceTeam;
   onJoin?: (teamId: string) => Promise<void>;
}

const dateLabel = (value: string) => {
   const date = parseISO(value);
   return date.getFullYear() === new Date().getFullYear()
      ? format(date, 'MMM d')
      : format(date, 'MMM yyyy');
};

export default function TeamLine({ team, onJoin }: TeamLineProps) {
   const { displayProperties } = useTeamsDisplayStore();
   const owner = team.members.find((member) => member.role === 'LEAD') ?? team.members[0];
   const [joining, setJoining] = useState(false);
   const { orgId } = useParams<{ orgId: string }>();
   // Team pages require membership, so only joined teams link to their overview and members page.
   // VI: Trang team yêu cầu là thành viên, nên chỉ team đã tham gia mới có link tới Overview và Members.
   const teamHref = team.joined ? `/${orgId}/team/${team.identifier}` : undefined;

   const join = async () => {
      setJoining(true);
      try {
         await onJoin?.(team.id);
      } finally {
         setJoining(false);
      }
   };

   return (
      <div className="w-full flex items-center py-2.5 px-6 border-b hover:bg-sidebar/50 border-muted-foreground/5 text-sm">
         {/* Name + identifier */}
         <div className="flex-1 min-w-0 flex items-center gap-2.5">
            <span className="inline-flex size-6 bg-muted/50 items-center justify-center rounded shrink-0 text-sm">
               {team.icon}
            </span>
            {teamHref ? (
               <Link href={`${teamHref}/overview`} className="font-medium truncate hover:underline">
                  {team.name}
               </Link>
            ) : (
               <span className="font-medium truncate">{team.name}</span>
            )}
            <span className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">
               {team.identifier}
            </span>
         </div>

         {displayProperties.membership && (
            <div className="hidden sm:block w-[110px] shrink-0">
               {team.joined && (
                  <span className="inline-flex items-center gap-1 text-xs border rounded-md px-1.5 py-0.5 text-muted-foreground">
                     <Check className="size-3" />
                     Joined
                  </span>
               )}
               {!team.joined && !onJoin && (
                  <p
                     className="text-xs text-muted-foreground"
                     title="Ask the workspace owner to add you to this team."
                  >
                     Owner managed
                  </p>
               )}
               {!team.joined && onJoin && (
                  <Button
                     size="xs"
                     variant="outline"
                     onClick={() => void join()}
                     disabled={joining}
                  >
                     {joining ? 'Joining…' : 'Join'}
                  </Button>
               )}
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
               {team.members.length > 0 && teamHref && (
                  <Link
                     href={`${teamHref}/members`}
                     aria-label={`${team.name} members (${team.members.length})`}
                     className="flex items-center gap-1.5 rounded hover:bg-muted/50"
                  >
                     <MemberStack members={team.members} />
                  </Link>
               )}
               {team.members.length > 0 && !teamHref && <MemberStack members={team.members} />}
            </div>
         )}

         {displayProperties.cycle && (
            <div className="hidden md:flex w-[80px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
               {team.cycleCount > 0 && (
                  <>
                     <Play className="size-3.5" />
                     {team.cycleCount}
                  </>
               )}
            </div>
         )}

         {displayProperties.projects && (
            <div className="hidden sm:flex w-[80px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
               <Box className="size-3.5" />
               {team.projectCount}
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
      </div>
   );
}

function MemberStack({ members }: { members: WorkspaceTeam['members'] }) {
   return (
      <>
         <span className="flex -space-x-1.5">
            {members.slice(0, 6).map((member) => (
               <Avatar key={member.id} className="size-5 border-2 border-container">
                  <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
                  <AvatarFallback>{member.name[0]}</AvatarFallback>
               </Avatar>
            ))}
         </span>
         <span className="text-xs text-muted-foreground">{members.length}</span>
      </>
   );
}
