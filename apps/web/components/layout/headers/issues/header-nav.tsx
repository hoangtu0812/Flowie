'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/navigation/messages.vi';

import { workspaceIssueViews } from '@/features/issues/workspace-views';
import { HStack } from '@astryxdesign/core/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useSearchStore } from '@/store/search-store';
import { SearchIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import Notifications from './notifications';

const ISSUE_VIEW_TABS = [
   { label: 'Active', segment: 'active' },
   { label: 'Backlog', segment: 'backlog' },
   { label: 'All issues', segment: 'all' },
];

function IssueViewTabs() {
   const tx = useMessages(messages);
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const pathname = usePathname();
   const tabsRef = useRef<HTMLDivElement>(null);
   useEffect(() => {
      tabsRef.current
         ?.querySelector('[aria-current="page"]')
         ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
   }, [pathname]);

   return (
      <HStack ref={tabsRef} gap={1} align="center" className="min-w-0 overflow-x-auto">
         {(teamId ? ISSUE_VIEW_TABS : workspaceIssueViews).map((tab) => {
            const href = teamId
               ? `/${orgId}/team/${teamId}/${tab.segment}`
               : `/${orgId}/issues${tab.segment ? `/${tab.segment}` : ''}`;
            const isActive = pathname === href;
            return (
               <Link
                  key={tab.segment}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                     'shrink-0 px-2.5 h-7 inline-flex items-center rounded-full border text-xs font-medium transition-colors',
                     isActive
                        ? 'bg-accent text-foreground border-border'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  )}
               >
                  {tx(tab.label)}
               </Link>
            );
         })}
      </HStack>
   );
}

export default function HeaderNav() {
   const tx = useMessages(messages);

   const { isSearchOpen, toggleSearch, closeSearch, setSearchQuery, searchQuery } =
      useSearchStore();
   const searchInputRef = useRef<HTMLInputElement>(null);
   const searchContainerRef = useRef<HTMLDivElement>(null);
   const previousValueRef = useRef<string>('');

   useEffect(() => {
      if (isSearchOpen && searchInputRef.current) {
         searchInputRef.current.focus();
      }
   }, [isSearchOpen]);

   useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
         if (
            searchContainerRef.current &&
            !searchContainerRef.current.contains(event.target as Node) &&
            isSearchOpen
         ) {
            if (searchQuery.trim() === '') {
               closeSearch();
            }
         }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => {
         document.removeEventListener('mousedown', handleClickOutside);
      };
   }, [isSearchOpen, closeSearch, searchQuery]);

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex min-w-0 items-center gap-3">
            <SidebarTrigger className="" />
            <IssueViewTabs />
         </div>

         <div className="flex items-center gap-2">
            {isSearchOpen ? (
               <div
                  ref={searchContainerRef}
                  className="relative flex items-center justify-center w-64 transition-all duration-200 ease-in-out"
               >
                  <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                     type="search"
                     ref={searchInputRef}
                     value={searchQuery}
                     onChange={(e) => {
                        previousValueRef.current = searchQuery;
                        const newValue = e.target.value;
                        setSearchQuery(newValue);

                        if (previousValueRef.current && newValue === '') {
                           const inputEvent = e.nativeEvent as InputEvent;
                           if (
                              inputEvent.inputType !== 'deleteContentBackward' &&
                              inputEvent.inputType !== 'deleteByCut'
                           ) {
                              closeSearch();
                           }
                        }
                     }}
                     placeholder={tx('Search issues...')}
                     className="pl-8 h-7 text-sm"
                     onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                           if (searchQuery.trim() === '') {
                              closeSearch();
                           } else {
                              setSearchQuery('');
                           }
                        }
                     }}
                  />
               </div>
            ) : (
               <>
                  <Button
                     variant="ghost"
                     size="icon"
                     onClick={toggleSearch}
                     className="h-8 w-8"
                     aria-label={tx('Search')}
                  >
                     <SearchIcon className="h-4 w-4" />
                  </Button>
                  <Notifications />
               </>
            )}
         </div>
      </div>
   );
}
