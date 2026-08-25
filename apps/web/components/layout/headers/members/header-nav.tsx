'use client';

import { Button } from '@/components/ui/button';
import { InviteMemberDialog } from '@/components/common/members/invite-member-dialog';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useMembersData } from '@/features/members/members-data';
import { Plus } from 'lucide-react';
import { useState } from 'react';

export default function HeaderNav() {
   const { members, canInvite } = useMembersData();
   const [inviteOpen, setInviteOpen] = useState(false);
   return (
      <>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div className="flex items-center gap-2">
               <SidebarTrigger className="" />
               <div className="flex items-center gap-1">
                  <span className="text-sm font-medium">Members</span>
                  <span className="text-xs bg-accent rounded-md px-1.5 py-1">{members.length}</span>
               </div>
            </div>
            <div className="flex items-center gap-2">
               <Button
                  className="relative"
                  size="xs"
                  variant="secondary"
                  onClick={() => setInviteOpen(true)}
                  disabled={!canInvite}
               >
                  <Plus className="size-4" />
                  Invite
               </Button>
            </div>
         </div>
         <InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
      </>
   );
}
