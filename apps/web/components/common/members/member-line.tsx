'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { SquareUser } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { LiveMember } from './use-live-members';

interface MemberLineProps {
   member: LiveMember;
}

const joinedLabel = (value: string) => {
   const date = new Date(value);
   return date.getFullYear() === new Date().getFullYear()
      ? format(date, 'MMM d')
      : format(date, 'MMM yyyy');
};

export default function MemberLine({ member }: MemberLineProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const isAdmin = member.workspaceRole === 'OWNER' || member.workspaceRole === 'ADMIN';
   return (
      <Link
         href={`/${orgId}/profiles/${member.id}`}
         className="w-full flex items-center py-2.5 px-6 border-b hover:bg-sidebar/50 border-muted-foreground/5 text-sm last:border-b-0"
      >
         <div className="flex-1 min-w-0 flex items-center gap-2.5">
            <Avatar className="size-8 shrink-0">
               <AvatarImage src={member.avatarUrl ?? undefined} alt={member.name} />
               <AvatarFallback>{member.name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start overflow-hidden">
               <span className="font-medium truncate w-full">{member.name}</span>
               <span className="text-xs text-muted-foreground truncate w-full">
                  {member.username ? `@${member.username}` : member.email}
               </span>
            </div>
         </div>
         <div className="w-[110px] shrink-0">
            <span
               className={cn(
                  'inline-flex items-center text-xs border rounded-md px-1.5 py-0.5',
                  isAdmin
                     ? 'text-indigo-500 dark:text-indigo-400 border-indigo-500/30 bg-indigo-500/5'
                     : 'text-muted-foreground'
               )}
            >
               {isAdmin ? 'Admin' : 'Member'}
            </span>
         </div>
         <div className="hidden lg:block w-[100px] shrink-0 text-xs text-muted-foreground">
            {joinedLabel(member.joinedAt)}
         </div>
         <div className="hidden md:flex w-[170px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            {member.teams.length > 0 && (
               <>
                  <SquareUser className="size-3.5 shrink-0" />
                  <span className="truncate">
                     {member.teams
                        .slice(0, 2)
                        .map((team) => team.identifier)
                        .join(', ')}
                     {member.teams.length > 2 && ` +${member.teams.length - 2}`}
                  </span>
               </>
            )}
         </div>
         <div className="hidden sm:flex w-[90px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            —
         </div>
      </Link>
   );
}
