'use client';

import { ExternalLink, Github, HelpCircle } from 'lucide-react';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export function HelpButton() {
   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <Button size="icon" variant="outline">
               <HelpCircle className="size-4" />
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Flowie</DropdownMenuLabel>
            <DropdownMenuItem asChild>
               <Link href="https://github.com/hoangtu0812/Flowie" target="_blank" rel="noreferrer">
                  <Github className="mr-2 h-4 w-4" />
                  <span>Source repository</span>
                  <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
               </Link>
            </DropdownMenuItem>
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
