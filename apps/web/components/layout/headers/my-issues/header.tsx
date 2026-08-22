'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { BarChart3, ListFilter, SearchIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

const TABS = [
   { value: 'assigned', label: 'Assigned' },
   { value: 'created', label: 'Created' },
];

export default function Header() {
   const pathname = usePathname();
   const router = useRouter();
   const searchParams = useSearchParams();
   const [searchOpen, setSearchOpen] = useState(false);
   const scope = searchParams.get('scope') === 'created' ? 'created' : 'assigned';
   const query = searchParams.get('q') ?? '';
   function update(values: { scope?: string; q?: string }) {
      const params = new URLSearchParams(searchParams.toString());
      if (values.scope !== undefined) {
         if (values.scope === 'assigned') params.delete('scope');
         else params.set('scope', values.scope);
      }
      if (values.q !== undefined) {
         if (values.q.trim()) params.set('q', values.q);
         else params.delete('q');
      }
      router.replace(`${pathname}${params.size ? `?${params.toString()}` : ''}`);
   }
   return (
      <div className="w-full flex flex-col items-center">
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div className="flex items-center gap-2">
               <SidebarTrigger />
               <span className="text-sm font-medium">My issues</span>
            </div>
            {searchOpen ? (
               <div className="relative w-64">
                  <SearchIcon className="absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                     autoFocus
                     className="h-7 pl-8 text-sm"
                     type="search"
                     value={query}
                     placeholder="Search issues..."
                     onChange={(event) => update({ q: event.target.value })}
                     onKeyDown={(event) => {
                        if (event.key === 'Escape') setSearchOpen(false);
                     }}
                  />
               </div>
            ) : (
               <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Search issues"
               >
                  <SearchIcon className="size-4" />
               </Button>
            )}
         </div>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div className="flex items-center gap-1">
               {TABS.map((tab) => (
                  <button
                     key={tab.value}
                     type="button"
                     onClick={() => update({ scope: tab.value })}
                     className={cn(
                        'px-2.5 h-7 inline-flex items-center rounded-full border text-xs font-medium transition-colors',
                        scope === tab.value
                           ? 'bg-accent text-foreground border-border'
                           : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
                     )}
                  >
                     {tab.label}
                  </button>
               ))}
            </div>
            <div className="flex items-center gap-1">
               <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => window.dispatchEvent(new Event('flowie:toggle-my-issues-filter'))}
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
