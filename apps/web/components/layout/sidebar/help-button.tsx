'use client';

import { HelpCircle, Keyboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function HelpButton() {
   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <Button size="icon" variant="outline">
               <HelpCircle className="size-4" />
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Trợ giúp Flowie</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
               <Keyboard className="mr-2 size-4" />
               <span>Phím tắt sắp ra mắt</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled>Liên hệ quản trị workspace để được hỗ trợ</DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
