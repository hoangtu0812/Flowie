'use client';

import { useLiveViews } from '@/components/common/views/use-live-views';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useRightPanelStore } from '@/store/right-panel-store';
import { BarChart3, FolderKanban, ListTodo, MoreHorizontal, Star } from 'lucide-react';
import { useParams } from 'next/navigation';

export default function Header() {
   const { viewId } = useParams<{ viewId: string }>();
   const { views } = useLiveViews();
   const { openPanel, togglePanel } = useRightPanelStore();
   const view = views.find((entry) => entry.id === viewId);
   const isIssue = view?.entityType === 'issue';
   return (
      <div className="w-full flex flex-col">
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div className="flex items-center gap-2 min-w-0">
               <SidebarTrigger />
               <span className="inline-flex size-5 items-center justify-center rounded bg-muted/50 text-xs shrink-0">
                  {isIssue ? (
                     <ListTodo className="size-3.5" />
                  ) : (
                     <FolderKanban className="size-3.5" />
                  )}
               </span>
               <span className="text-sm font-medium truncate">{view?.name ?? 'Saved view'}</span>
               <Star className="size-3.5 text-muted-foreground shrink-0 ml-1" />
               <MoreHorizontal className="size-3.5 text-muted-foreground shrink-0" />
            </div>
         </div>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <span className="text-xs text-muted-foreground">
               {view?.entityType === 'project' ? 'Project view' : 'Issue view'}
            </span>
            {isIssue && (
               <Button
                  size="xs"
                  variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
                  onClick={() => togglePanel('insights')}
               >
                  <BarChart3 className="size-4" />
               </Button>
            )}
         </div>
      </div>
   );
}
