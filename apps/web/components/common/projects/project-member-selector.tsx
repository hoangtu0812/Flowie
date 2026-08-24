'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { LiveProjectMember, LiveWorkspaceMember } from './details/use-live-project';

interface ProjectMemberSelectorProps {
   members: LiveProjectMember[];
   availableMembers: LiveWorkspaceMember[];
   onMembersChange: (userIds: string[]) => Promise<void>;
}

export function ProjectMemberSelector({
   members,
   availableMembers,
   onMembersChange,
}: ProjectMemberSelectorProps) {
   const [open, setOpen] = useState(false);
   const [selectedIds, setSelectedIds] = useState<string[]>([]);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   const changeOpen = (nextOpen: boolean) => {
      setOpen(nextOpen);
      if (nextOpen) {
         setSelectedIds(members.map((member) => member.user.id));
         setError(undefined);
      }
   };

   const toggle = (userId: string, checked: boolean) => {
      setSelectedIds((current) =>
         checked ? [...new Set([...current, userId])] : current.filter((id) => id !== userId)
      );
   };

   const save = async () => {
      setSaving(true);
      setError(undefined);
      try {
         await onMembersChange(selectedIds);
         setOpen(false);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not update project members.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <>
         {members.length > 0 ? (
            <button
               type="button"
               className="inline-flex items-center gap-1.5 hover:text-foreground/80 transition-colors"
               onClick={() => changeOpen(true)}
            >
               <span className="flex -space-x-1.5">
                  {members.slice(0, 3).map(({ user }) => (
                     <Avatar key={user.id} className="size-5 border-2 border-container">
                        <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
                        <AvatarFallback>{user.name[0]}</AvatarFallback>
                     </Avatar>
                  ))}
               </span>
               {members.length} {members.length === 1 ? 'member' : 'members'}
            </button>
         ) : (
            <button
               type="button"
               className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
               onClick={() => changeOpen(true)}
            >
               <UserPlus className="size-3.5" />
               Add members
            </button>
         )}

         <Dialog open={open} onOpenChange={changeOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Project members</DialogTitle>
                  <DialogDescription>
                     Choose active workspace members who are part of this project.
                  </DialogDescription>
               </DialogHeader>
               <div className="max-h-72 overflow-y-auto rounded-md border divide-y">
                  {availableMembers.map(({ user }) => {
                     const checked = selectedIds.includes(user.id);
                     return (
                        <label
                           key={user.id}
                           className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40 cursor-pointer"
                        >
                           <Checkbox
                              checked={checked}
                              onCheckedChange={(value) => toggle(user.id, value === true)}
                           />
                           <Avatar className="size-6">
                              <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
                              <AvatarFallback>{user.name[0]}</AvatarFallback>
                           </Avatar>
                           <span className="text-sm truncate">{user.name}</span>
                        </label>
                     );
                  })}
                  {availableMembers.length === 0 && (
                     <p className="px-3 py-4 text-sm text-muted-foreground">
                        No active workspace members are available.
                     </p>
                  )}
               </div>
               {error && <p className="text-sm text-destructive">{error}</p>}
               <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => changeOpen(false)}>
                     Cancel
                  </Button>
                  <Button type="button" disabled={saving} onClick={() => void save()}>
                     {saving ? 'Saving…' : 'Save'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </>
   );
}
