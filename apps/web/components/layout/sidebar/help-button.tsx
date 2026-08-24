'use client';

import * as React from 'react';
import { ExternalLink, Github, HelpCircle, Keyboard, Search } from 'lucide-react';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
            <div className="p-2">
               <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                     type="search"
                     placeholder="Help search unavailable"
                     className="pl-8"
                     disabled
                  />
               </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Shortcuts</DropdownMenuLabel>
            <DropdownMenuItem disabled>
               <Keyboard className="mr-2 h-4 w-4" />
               <span>Keyboard shortcuts</span>
               <span className="ml-auto text-xs text-muted-foreground">⌘/</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
