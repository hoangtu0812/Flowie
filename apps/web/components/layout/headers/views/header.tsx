'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/navigation/messages.vi';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { Plus } from 'lucide-react';

export default function Header() {
   const tx = useMessages(messages);

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2">
            <SidebarTrigger />
            <span className="text-sm font-medium">{tx('Views')}</span>
         </div>
         <Button size="xs" variant="ghost">
            <Plus className="size-4" />
         </Button>
      </div>
   );
}
