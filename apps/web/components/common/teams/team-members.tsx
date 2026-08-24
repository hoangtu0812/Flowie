'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuRadioGroup,
   DropdownMenuRadioItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Plus, SlidersHorizontal } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useLiveTeam } from './use-live-team';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
type MemberSort = 'name' | 'role' | 'joined';

const sortLabels: Record<MemberSort, string> = {
   name: 'Name',
   role: 'Role',
   joined: 'Joined date',
};

/** Team members table keeps the original UI and uses the Teams API for membership. */
export default function TeamMembers() {
   const { teamId } = useParams<{ orgId: string; teamId: string }>();
   const { workspaceId, team, workspaceMembers, loading, error, reload } = useLiveTeam(teamId);
   const [open, setOpen] = useState(false);
   const [userId, setUserId] = useState('');
   const [role, setRole] = useState('MEMBER');
   const [sortBy, setSortBy] = useState<MemberSort>('name');
   const [submitting, setSubmitting] = useState(false);
   const [formError, setFormError] = useState<string>();

   const availablePeople = useMemo(() => {
      const teamMemberIds = new Set(team?.members.map((member) => member.user.id));
      return workspaceMembers.filter(
         (member) => member.status === 'ACTIVE' && !teamMemberIds.has(member.userId)
      );
   }, [team?.members, workspaceMembers]);

   if (loading)
      return <div className="px-8 py-10 text-sm text-muted-foreground">Loading members…</div>;
   if (error || !team || !workspaceId)
      return (
         <div className="px-8 py-10 text-sm text-destructive">{error ?? 'Team not found.'}</div>
      );

   const members = [...team.members].sort((a, b) => {
      const byName = a.user.name.localeCompare(b.user.name);
      if (sortBy === 'role') return a.role.localeCompare(b.role) || byName;
      if (sortBy === 'joined') return b.createdAt.localeCompare(a.createdAt) || byName;
      return byName;
   });
   const addMember = async () => {
      if (!userId) return;
      setSubmitting(true);
      setFormError(undefined);
      try {
         const response = await fetch(`${api}/teams/${team.id}/members`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId, userId, role }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not add member.');
         }
         setOpen(false);
         setUserId('');
         reload();
      } catch (caught) {
         setFormError(caught instanceof Error ? caught.message : 'Could not add member.');
      } finally {
         setSubmitting(false);
      }
   };

   return (
      <div className="w-full">
         <div className="flex items-center justify-between px-6 py-3">
            <span className="text-sm text-muted-foreground font-medium">
               {sortLabels[sortBy]} ↓
            </span>
            <div className="flex items-center gap-2">
               <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => setOpen(true)}
                  disabled={!availablePeople.length}
               >
                  <Plus className="size-4 mr-1" />
                  Add a member
               </Button>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button size="xs" variant="ghost">
                        <SlidersHorizontal className="size-4" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                     <DropdownMenuRadioGroup
                        value={sortBy}
                        onValueChange={(value) => setSortBy(value as MemberSort)}
                     >
                        <DropdownMenuRadioItem value="name">Name</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="role">Role</DropdownMenuRadioItem>
                        <DropdownMenuRadioItem value="joined">Joined date</DropdownMenuRadioItem>
                     </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </div>

         <div className="bg-container px-6 py-1.5 text-sm flex items-center text-muted-foreground border-b sticky top-0 z-10">
            <div className="w-[55%] md:w-[45%]">Name</div>
            <div className="hidden md:block md:w-[35%]">Email</div>
            <div className="w-[45%] md:w-[20%]">Role</div>
         </div>

         {members.map((member) => (
            <div
               key={member.user.id}
               className="w-full flex items-center px-6 h-12 hover:bg-sidebar/50 border-b border-border/30 text-sm"
            >
               <div className="w-[55%] md:w-[45%] flex items-center gap-2.5 min-w-0">
                  <Avatar className="size-6 shrink-0">
                     <AvatarImage src={member.user.avatarUrl ?? undefined} alt={member.user.name} />
                     <AvatarFallback>{member.user.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                     <span className="font-medium truncate">{member.user.name}</span>
                     {member.user.title && (
                        <span className="text-xs text-muted-foreground truncate">
                           {member.user.title}
                        </span>
                     )}
                  </div>
               </div>
               <div className="hidden md:block md:w-[35%] text-muted-foreground truncate">
                  {member.user.email}
               </div>
               <div className="w-[45%] md:w-[20%]">
                  <span className="text-xs px-2 py-1 rounded-md bg-accent text-muted-foreground">
                     {member.role.toLowerCase()}
                  </span>
               </div>
            </div>
         ))}

         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Add a member</DialogTitle>
                  <DialogDescription>
                     Add an active workspace member to {team.name}.
                  </DialogDescription>
               </DialogHeader>
               <div className="space-y-3">
                  <Select value={userId} onValueChange={setUserId}>
                     <SelectTrigger>
                        <SelectValue placeholder="Select a person" />
                     </SelectTrigger>
                     <SelectContent>
                        {availablePeople.map((member) => (
                           <SelectItem key={member.userId} value={member.userId}>
                              {member.user.name} · {member.user.email}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
                  <Select value={role} onValueChange={setRole}>
                     <SelectTrigger>
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="LEAD">Lead</SelectItem>
                     </SelectContent>
                  </Select>
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
               </div>
               <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>
                     Cancel
                  </Button>
                  <Button onClick={() => void addMember()} disabled={!userId || submitting}>
                     {submitting ? 'Adding…' : 'Add member'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
