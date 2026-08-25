'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useMembersData } from '@/features/members/members-data';
import { cn } from '@/lib/utils';
import type { User } from '@/types/users';
import { format, parseISO } from 'date-fns';
import { MoreHorizontal, SquareUser } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

interface MemberLineProps {
   user: User;
}

/** "mason.carter" → "Mason Carter" (Linear shows display name + handle). */
const displayNameOf = (user: User) =>
   user.name
      .split('.')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

/** Linear-style joined date: current year → "Mar 17", otherwise "Oct 2023". */
const joinedLabel = (iso: string) => {
   const date = parseISO(iso);
   return date.getFullYear() === 2026 ? format(date, 'MMM d') : format(date, 'MMM yyyy');
};

export default function MemberLine({ user }: MemberLineProps) {
   const { orgId } = useParams<{ orgId: string }>();
   const { canChangeRole, canRemove, changeMemberRole, removeMember } = useMembersData();
   const isApplication = user.role === 'Application';
   const membershipStatus =
      user.membershipStatus === 'INVITED'
         ? 'Invited'
         : user.workspaceRole === 'OWNER'
           ? 'Owner'
           : user.role;

   const updateRole = async (role: 'MEMBER' | 'ADMIN') => {
      try {
         await changeMemberRole(user, role);
         toast.success('Member role updated.');
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update member role.');
      }
   };

   const remove = async () => {
      try {
         await removeMember(user);
         toast.success('Member removed.');
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not remove this member.');
      }
   };

   return (
      <div className="w-full flex items-center py-2.5 px-6 border-b hover:bg-sidebar/50 border-muted-foreground/5 text-sm last:border-b-0">
         {/* Name */}
         <Link
            href={`/${orgId}/profiles/${user.id}`}
            className="flex-1 min-w-0 flex items-center gap-2.5"
         >
            <Avatar className="size-8 shrink-0">
               <AvatarImage src={user.avatarUrl} alt={user.name} />
               <AvatarFallback>{user.name[0]}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col items-start overflow-hidden">
               <span className="font-medium truncate w-full">{displayNameOf(user)}</span>
               <span className="text-xs text-muted-foreground truncate w-full">{user.name}</span>
            </div>
         </Link>

         {/* Status (role) */}
         <div className="w-[110px] shrink-0">
            {isApplication ? (
               <span className="text-xs text-muted-foreground">Application</span>
            ) : (
               <span
                  className={cn(
                     'inline-flex items-center text-xs border rounded-md px-1.5 py-0.5',
                     user.role === 'Admin'
                        ? 'text-indigo-500 dark:text-indigo-400 border-indigo-500/30 bg-indigo-500/5'
                        : 'text-muted-foreground'
                  )}
               >
                  {membershipStatus}
               </span>
            )}
         </div>

         {/* Joined */}
         <div className="hidden lg:block w-[100px] shrink-0 text-xs text-muted-foreground">
            {joinedLabel(user.joinedDate)}
         </div>

         {/* Teams */}
         <div className="hidden md:flex w-[170px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground min-w-0">
            {user.teamIds.length > 0 && (
               <>
                  <SquareUser className="size-3.5 shrink-0" />
                  <span className="truncate">
                     {user.teamIds.slice(0, 2).join(', ')}
                     {user.teamIds.length > 2 && ` +${user.teamIds.length - 2}`}
                  </span>
               </>
            )}
         </div>

         {/* Last seen (Linear only shows currently-online members) */}
         <div className="hidden sm:flex w-[90px] shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            {user.status === 'online' && !isApplication && (
               <>
                  <span className="size-1.5 rounded-full bg-[#00cc66]" />
                  Online
               </>
            )}
         </div>
         <div className="w-8 shrink-0 flex justify-end">
            {(canChangeRole || canRemove) && user.workspaceRole !== 'OWNER' && (
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        aria-label={`Manage ${user.name}`}
                        onClick={(event) => event.stopPropagation()}
                     >
                        <MoreHorizontal className="size-4" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                     {canChangeRole && (
                        <>
                           <DropdownMenuItem
                              disabled={user.role === 'Member'}
                              onSelect={() => void updateRole('MEMBER')}
                           >
                              Make member
                           </DropdownMenuItem>
                           <DropdownMenuItem
                              disabled={user.role === 'Admin'}
                              onSelect={() => void updateRole('ADMIN')}
                           >
                              Make admin
                           </DropdownMenuItem>
                        </>
                     )}
                     {canChangeRole && canRemove && <DropdownMenuSeparator />}
                     {canRemove && (
                        <DropdownMenuItem variant="destructive" onSelect={() => void remove()}>
                           Remove member
                        </DropdownMenuItem>
                     )}
                  </DropdownMenuContent>
               </DropdownMenu>
            )}
         </div>
      </div>
   );
}
