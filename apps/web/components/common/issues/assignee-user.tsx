'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIssuesStore } from '@/store/issues-store';
import { CheckIcon, CircleUserRound, UserIcon } from 'lucide-react';

type Person = { id: string; name: string; avatarUrl?: string | null };

interface AssigneeUserProps {
   user: Person | null;
   /** Enables a persisted assignment mutation when the current issue id is available. */
   issueId?: string;
}

function AssigneeAvatar({ user }: { user: Person | null }) {
   if (!user) {
      return (
         <div className="size-6 flex items-center justify-center">
            <CircleUserRound className="size-5 text-zinc-600" />
         </div>
      );
   }
   return (
      <Avatar className="size-6 shrink-0">
         <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
         <AvatarFallback>{user.name[0]}</AvatarFallback>
      </Avatar>
   );
}

/** Renders a live workspace assignee and, on detail pages, persists reassignment through Issues API. */
export function AssigneeUser({ user, issueId }: AssigneeUserProps) {
   const { members, updateIssueAssignee } = useIssuesStore();

   if (!issueId) return <AssigneeAvatar user={user} />;

   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <button
               className="relative w-fit focus:outline-none"
               type="button"
               aria-label="Assign issue"
            >
               <AssigneeAvatar user={user} />
            </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="w-[206px]">
            <DropdownMenuLabel>Assign to...</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => updateIssueAssignee(issueId, null)}>
               <div className="flex items-center gap-2">
                  <UserIcon className="h-5 w-5" />
                  <span>No assignee</span>
               </div>
               {!user && <CheckIcon className="ml-auto h-4 w-4" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {members.map((member) => (
               <DropdownMenuItem
                  key={member.id}
                  onClick={() => updateIssueAssignee(issueId, member)}
               >
                  <div className="flex items-center gap-2">
                     <Avatar className="h-5 w-5">
                        <AvatarImage src={member.avatarUrl || undefined} alt={member.name} />
                        <AvatarFallback>{member.name[0]}</AvatarFallback>
                     </Avatar>
                     <span>{member.name}</span>
                  </div>
                  {user?.id === member.id && <CheckIcon className="ml-auto h-4 w-4" />}
               </DropdownMenuItem>
            ))}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
