'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus } from 'lucide-react';

export default function Header() {
   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2">
            <SidebarTrigger />
            <span className="text-sm font-medium">Cycles</span>
         </div>
         <Button
            size="xs"
            variant="secondary"
            onClick={() => window.dispatchEvent(new Event('flowie:create-cycle'))}
         >
            <Plus className="size-4" />
            <span className="hidden sm:inline ml-1">Create cycle</span>
         </Button>
      </div>
   );
}
