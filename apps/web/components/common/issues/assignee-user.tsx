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
import { statusUserColors, User } from '@/mock-data/users';
import { useIssuesStore } from '@/store/issues-store';
import { CheckIcon, CircleUserRound, UserIcon } from 'lucide-react';
import { useState } from 'react';

interface AssigneeUserProps {
   user: User | null;
   /** Persists the choice when supplied; without it the control stays read-only. */
   issueId?: string;
}

export function AssigneeUser({ user, issueId }: AssigneeUserProps) {
   const [open, setOpen] = useState(false);
   const [saving, setSaving] = useState(false);
   const { members, updateIssueAssignee } = useIssuesStore();

   const assign = async (nextAssignee: User | null) => {
      setOpen(false);
      if (!issueId || nextAssignee?.id === user?.id) return;
      setSaving(true);
      await updateIssueAssignee(issueId, nextAssignee);
      setSaving(false);
   };

   const renderAvatar = () => {
      if (user) {
         return (
            <Avatar className="size-6 shrink-0">
               <AvatarImage src={user.avatarUrl} alt={user.name} />
               <AvatarFallback>{user.name[0]}</AvatarFallback>
            </Avatar>
         );
      }
      return (
         <div className="size-6 flex items-center justify-center">
            <CircleUserRound className="size-5 text-zinc-600" />
         </div>
      );
   };

   // Without an issue the avatar is pure presentation — rendering a picker that
   // cannot save anything is what made this control look mocked.
   if (!issueId) {
      return <span className="relative w-fit block">{renderAvatar()}</span>;
   }

   return (
      <DropdownMenu open={open} onOpenChange={setOpen}>
         <DropdownMenuTrigger asChild>
            <button
               className="relative w-fit focus:outline-none disabled:opacity-60"
               disabled={saving}
               onClick={(event) => event.stopPropagation()}
            >
               {renderAvatar()}
               {user && (
                  <span
                     className="border-background absolute -end-0.5 -bottom-0.5 size-2.5 rounded-full border-2"
                     style={{ backgroundColor: statusUserColors[user.status] }}
                  >
                     <span className="sr-only">{user.status}</span>
                  </span>
               )}
            </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="w-[206px]">
            <DropdownMenuLabel>Assign to...</DropdownMenuLabel>
            <DropdownMenuItem
               onClick={(event) => {
                  event.stopPropagation();
                  void assign(null);
               }}
            >
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
                  onClick={(event) => {
                     event.stopPropagation();
                     void assign(member);
                  }}
               >
                  <div className="flex items-center gap-2 min-w-0">
                     <Avatar className="h-5 w-5">
                        <AvatarImage src={member.avatarUrl} alt={member.name} />
                        <AvatarFallback>{member.name[0]}</AvatarFallback>
                     </Avatar>
                     <span className="truncate">{member.name}</span>
                  </div>
                  {user?.id === member.id && <CheckIcon className="ml-auto h-4 w-4 shrink-0" />}
               </DropdownMenuItem>
            ))}
            {members.length === 0 && (
               <DropdownMenuItem disabled>No workspace members yet</DropdownMenuItem>
            )}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
