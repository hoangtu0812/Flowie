'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingState } from '@/components/common/loading-state';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Plus, SlidersHorizontal, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useLiveTeam } from './use-live-team';

/** Team member list and membership controls using the native Team API. */
export default function TeamMembers() {
   const { teamId } = useParams<{ teamId: string }>();
   const { team, workspaceMembers, loading, error, addMember, updateMember, removeMember } =
      useLiveTeam(teamId);
   const [dialogOpen, setDialogOpen] = useState(false);
   const [personId, setPersonId] = useState('');
   const [role, setRole] = useState<'LEAD' | 'MEMBER'>('MEMBER');
   const [saving, setSaving] = useState(false);

   const members = useMemo(
      () => [...(team?.members ?? [])].sort((a, b) => a.user.name.localeCompare(b.user.name)),
      [team]
   );
   const availablePeople = useMemo(
      () =>
         workspaceMembers.filter(
            (member) =>
               member.status === 'ACTIVE' &&
               !members.some((teamMember) => teamMember.user.id === member.userId)
         ),
      [members, workspaceMembers]
   );

   if (loading) return <LoadingState label="Loading team members…" />;
   if (error || !team)
      return (
         <div className="h-full grid place-items-center text-sm text-destructive">
            {error ?? 'Team not found.'}
         </div>
      );

   const add = async () => {
      if (!personId) return;
      setSaving(true);
      try {
         await addMember(personId, role);
         setDialogOpen(false);
         setPersonId('');
         setRole('MEMBER');
         toast.success('Team member added.');
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not add team member.');
      } finally {
         setSaving(false);
      }
   };

   const changeRole = async (userId: string, nextRole: 'LEAD' | 'MEMBER') => {
      try {
         await updateMember(userId, nextRole);
         toast.success('Team role updated.');
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not update team member.');
      }
   };

   const remove = async (userId: string) => {
      try {
         await removeMember(userId);
         toast.success('Team member removed.');
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not remove team member.');
      }
   };

   return (
      <div className="w-full">
         <div className="flex items-center justify-between px-6 py-3">
            <span className="text-sm text-muted-foreground font-medium">Name ↓</span>
            <div className="flex items-center gap-2">
               <Button size="xs" variant="secondary" onClick={() => setDialogOpen(true)}>
                  <Plus className="size-4 mr-1" />
                  Add a member
               </Button>
               <Button size="xs" variant="ghost" aria-label="Display options">
                  <SlidersHorizontal className="size-4" />
               </Button>
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
               className="group w-full flex items-center px-6 h-12 hover:bg-sidebar/50 border-b border-border/30 text-sm"
            >
               <div className="w-[55%] md:w-[45%] flex items-center gap-2.5 min-w-0">
                  <Avatar className="size-6 shrink-0">
                     <AvatarImage src={member.user.avatarUrl ?? undefined} alt={member.user.name} />
                     <AvatarFallback>{member.user.name[0]}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                     <span className="font-medium truncate">{member.user.name}</span>
                     <span className="text-xs text-muted-foreground truncate">
                        {member.user.title ?? member.user.name.split('.')[0]}
                     </span>
                  </div>
               </div>
               <div className="hidden md:block md:w-[35%] text-muted-foreground truncate">
                  {member.user.email}
               </div>
               <div className="w-[45%] md:w-[20%] flex items-center gap-1">
                  <Select
                     value={member.role}
                     onValueChange={(value: 'LEAD' | 'MEMBER') =>
                        void changeRole(member.user.id, value)
                     }
                  >
                     <SelectTrigger className="h-7 w-24 border-0 bg-accent text-xs">
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="LEAD">Lead</SelectItem>
                     </SelectContent>
                  </Select>
                  <Button
                     variant="ghost"
                     size="icon"
                     className="size-7 opacity-0 group-hover:opacity-100"
                     onClick={() => void remove(member.user.id)}
                     aria-label={`Remove ${member.user.name}`}
                  >
                     <X className="size-3.5" />
                  </Button>
               </div>
            </div>
         ))}
         <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Add a team member</DialogTitle>
               </DialogHeader>
               <div className="space-y-3">
                  <Select value={personId} onValueChange={setPersonId}>
                     <SelectTrigger>
                        <SelectValue placeholder="Select workspace member" />
                     </SelectTrigger>
                     <SelectContent>
                        {availablePeople.map((person) => (
                           <SelectItem key={person.userId} value={person.userId}>
                              {person.user.name} · {person.user.email}
                           </SelectItem>
                        ))}
                     </SelectContent>
                  </Select>
                  <Select value={role} onValueChange={(value: 'LEAD' | 'MEMBER') => setRole(value)}>
                     <SelectTrigger>
                        <SelectValue />
                     </SelectTrigger>
                     <SelectContent>
                        <SelectItem value="MEMBER">Member</SelectItem>
                        <SelectItem value="LEAD">Lead</SelectItem>
                     </SelectContent>
                  </Select>
                  {availablePeople.length === 0 && (
                     <p className="text-sm text-muted-foreground">
                        All active workspace members are already in this team.
                     </p>
                  )}
               </div>
               <DialogFooter>
                  <Button variant="outline" disabled={saving} onClick={() => setDialogOpen(false)}>
                     Cancel
                  </Button>
                  <Button disabled={saving || !personId} onClick={() => void add()}>
                     {saving ? 'Adding…' : 'Add member'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
