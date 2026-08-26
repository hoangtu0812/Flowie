'use client';

import * as React from 'react';
import { ExternalLink, HelpCircle, Keyboard, Search } from 'lucide-react';

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
import { APP_HIGHLIGHTS, CHANGELOG_URL, releaseLabel } from '@/lib/release';
import Link from 'next/link';
import { RiGithubFill, RiGlobalLine, RiRocket2Fill } from '@remixicon/react';

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
                  <Input type="search" placeholder="Search for help..." className="pl-8" />
               </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Shortcuts</DropdownMenuLabel>
            <DropdownMenuItem>
               <Keyboard className="mr-2 h-4 w-4" />
               <span>Keyboard shortcuts</span>
               <span className="ml-auto text-xs text-muted-foreground">⌘/</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Flowie links</DropdownMenuLabel>
            <DropdownMenuItem asChild>
               <Link href="https://hoangtu.io.vn" target="_blank">
                  <RiGlobalLine className="mr-2 h-4 w-4" />
                  <span>Hoang Tu</span>
                  <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
               </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
               <Link href="https://flowie.loopstudio.io.vn" target="_blank">
                  <RiRocket2Fill className="mr-2 h-4 w-4" />
                  <span>Flowie</span>
                  <ExternalLink className="ml-auto h-3 w-3 text-muted-foreground" />
               </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
               <Link href="https://github.com/hoangtu0812/Flowie/issues" target="_blank">
                  <RiGithubFill className="mr-2 h-4 w-4" />
                  <span>Report an issue</span>
               </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>What&apos;s new</DropdownMenuLabel>
            {/* Straight from the top release section of CHANGELOG.md. */}
            {APP_HIGHLIGHTS.map((highlight) => (
               <DropdownMenuItem key={highlight} asChild>
                  <Link href={CHANGELOG_URL} target="_blank" className="flex items-start">
                     <div className="mr-2 mt-1.5 flex h-4 w-1.5 shrink-0 items-start justify-center">
                        <div className="h-1.5 w-1.5 rounded-full bg-blue-500"></div>
                     </div>
                     <span className="line-clamp-2 whitespace-normal">{highlight}</span>
                  </Link>
               </DropdownMenuItem>
            ))}
            <DropdownMenuItem asChild>
               <Link
                  href="https://github.com/hoangtu0812/Flowie"
                  target="_blank"
                  className="flex items-center"
               >
                  <div className="mr-2 flex h-4 w-4 items-center justify-center">
                     <div className="h-1.5 w-1.5 rounded-full bg-transparent"></div>
                  </div>
                  <span>GitHub</span>
                  <ExternalLink className="ml-2 h-3 w-3 text-muted-foreground" />
               </Link>
            </DropdownMenuItem>
            {releaseLabel() && (
               <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                     <Link
                        href={CHANGELOG_URL}
                        target="_blank"
                        className="flex items-center text-xs text-muted-foreground"
                     >
                        <span>Flowie {releaseLabel()}</span>
                        <ExternalLink className="ml-auto h-3 w-3" />
                     </Link>
                  </DropdownMenuItem>
               </>
            )}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
