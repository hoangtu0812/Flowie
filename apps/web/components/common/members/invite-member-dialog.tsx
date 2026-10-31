'use client';

import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { InvitationUserPicker, type InvitationUser } from './invitation-user-picker';
import { type InvitableRole, useMembersData } from '@/features/members/members-data';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';

export function InviteMemberDialog({
   open,
   onOpenChange,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   const { inviteMember, workspaceLoading, workspaceId } = useMembersData();
   const [person, setPerson] = useState<InvitationUser | null>(null);
   const [role, setRole] = useState<InvitableRole>('MEMBER');
   const [submitting, setSubmitting] = useState(false);
   useEffect(() => {
      setPerson(null);
      setRole('MEMBER');
   }, [open, workspaceId]);
   const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!person || submitting || workspaceLoading || !workspaceId) return;
      setSubmitting(true);
      try {
         await inviteMember(person.email, role);
         toast.success('Invitation created.');
         setPerson(null);
         onOpenChange(false);
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not invite this person.');
      } finally {
         setSubmitting(false);
      }
   };
   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-md">
            <DialogHeader>
               <DialogTitle>Invite member</DialogTitle>
               <DialogDescription>The person must already have a Flowie account.</DialogDescription>
            </DialogHeader>
            <form className="grid gap-4" onSubmit={submit}>
               {open && workspaceId && (
                  <InvitationUserPicker
                     key={workspaceId}
                     workspaceId={workspaceId}
                     value={person}
                     onChange={setPerson}
                     disabled={submitting || workspaceLoading}
                  />
               )}
               <label className="grid gap-1.5 text-sm font-medium">
                  Role
                  <select
                     className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                     value={role}
                     onChange={(event) => setRole(event.target.value as InvitableRole)}
                  >
                     <option value="MEMBER">Member</option>
                     <option value="ADMIN">Admin</option>
                     <option value="ADMIN_VIEWER">Admin (read-only)</option>
                  </select>
               </label>
               <DialogFooter>
                  <Button
                     type="button"
                     variant="ghost"
                     onClick={() => onOpenChange(false)}
                     disabled={submitting}
                  >
                     Cancel
                  </Button>
                  <Button
                     type="submit"
                     disabled={submitting || workspaceLoading || !workspaceId || !person}
                  >
                     {submitting ? 'Inviting…' : workspaceLoading ? 'Loading workspace…' : 'Invite'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}
