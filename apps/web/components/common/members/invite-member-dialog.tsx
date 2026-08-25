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
import { Input } from '@/components/ui/input';
import { useMembersData } from '@/features/members/members-data';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';

export function InviteMemberDialog({
   open,
   onOpenChange,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   const { inviteMember, workspaceLoading, workspaceId } = useMembersData();
   const [email, setEmail] = useState('');
   const [role, setRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
   const [submitting, setSubmitting] = useState(false);
   const submit = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!email.trim()) return;
      setSubmitting(true);
      try {
         await inviteMember(email, role);
         toast.success('Invitation created.');
         setEmail('');
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
               <label className="grid gap-1.5 text-sm font-medium">
                  Email
                  <Input
                     autoFocus
                     type="email"
                     value={email}
                     onChange={(event) => setEmail(event.target.value)}
                     required
                  />
               </label>
               <label className="grid gap-1.5 text-sm font-medium">
                  Role
                  <select
                     className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                     value={role}
                     onChange={(event) => setRole(event.target.value as 'MEMBER' | 'ADMIN')}
                  >
                     <option value="MEMBER">Member</option>
                     <option value="ADMIN">Admin</option>
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
                     disabled={submitting || workspaceLoading || !workspaceId || !email.trim()}
                  >
                     {submitting ? 'Inviting…' : workspaceLoading ? 'Loading workspace…' : 'Invite'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}
