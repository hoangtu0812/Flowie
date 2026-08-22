'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus, SlidersHorizontal } from 'lucide-react';

export default function Header() {
   return (
      <div className="w-full flex flex-col items-center">
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div className="flex items-center gap-2">
               <SidebarTrigger />
               <span className="text-sm font-medium">Members</span>
            </div>
            <Button
               size="xs"
               variant="secondary"
               onClick={() => window.dispatchEvent(new Event('flowie:invite-member'))}
            >
               <Plus className="size-4" />
               <span className="hidden sm:inline ml-1">Invite</span>
            </Button>
         </div>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div />
            <Button size="xs" variant="ghost">
               <SlidersHorizontal className="size-4" />
               <span className="hidden sm:inline ml-1">Display</span>
            </Button>
         </div>
      </div>
   );
}
