'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { BarChart3, ListFilter, SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

const TABS = [
   { label: 'Active', segment: 'active' },
   { label: 'Backlog', segment: 'backlog' },
   { label: 'All issues', segment: 'all' },
];

export default function Header() {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const pathname = usePathname();
   const router = useRouter();
   const searchParams = useSearchParams();
   const [searchOpen, setSearchOpen] = useState(false);
   const [query, setQuery] = useState(searchParams.get('q') ?? '');

   useEffect(() => setQuery(searchParams.get('q') ?? ''), [searchParams]);

   function updateQuery(value: string) {
      setQuery(value);
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set('q', value);
      else params.delete('q');
      router.replace(`${pathname}${params.size ? `?${params.toString()}` : ''}`);
   }

   return (
      <div className="w-full flex flex-col items-center">
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div className="flex items-center gap-3">
               <SidebarTrigger />
               <div className="flex items-center gap-1">
                  {TABS.map((tab) => {
                     const href = `/${orgId}/team/${teamId}/${tab.segment}`;
                     return (
                        <Link
                           key={tab.segment}
                           href={href}
                           className={cn(
                              'px-2.5 h-7 inline-flex items-center rounded-full border text-xs font-medium transition-colors',
                              pathname === href
                                 ? 'bg-accent text-foreground border-border'
                                 : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
                           )}
                        >
                           {tab.label}
                        </Link>
                     );
                  })}
               </div>
            </div>
            {searchOpen ? (
               <div className="relative w-64">
                  <SearchIcon className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                     autoFocus
                     type="search"
                     value={query}
                     onChange={(event) => updateQuery(event.target.value)}
                     onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                           setSearchOpen(false);
                           if (!query) updateQuery('');
                        }
                     }}
                     placeholder="Search issues..."
                     className="h-7 pl-8 text-sm"
                  />
               </div>
            ) : (
               <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSearchOpen(true)}
                  className="h-8 w-8"
                  aria-label="Search issues"
               >
                  <SearchIcon className="h-4 w-4" />
               </Button>
            )}
         </div>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div />
            <div className="flex items-center gap-1">
               <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => window.dispatchEvent(new Event('flowie:toggle-issue-filter'))}
               >
                  <ListFilter className="size-4" />
                  <span className="hidden sm:inline ml-1">Filter</span>
               </Button>
               <Button size="xs" variant="ghost" aria-label="Issue insights">
                  <BarChart3 className="size-4" />
               </Button>
            </div>
         </div>
      </div>
   );
}
