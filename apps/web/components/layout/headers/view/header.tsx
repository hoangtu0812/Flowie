'use client';

import { useLiveViews } from '@/components/common/views/use-live-views';
import { viewIssues, viewProjects } from '@/components/common/views/view-filter';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useRightPanelStore } from '@/store/right-panel-store';
import { useIssuesStore } from '@/store/issues-store';
import { BarChart3, FolderKanban, ListTodo, MoreHorizontal, Star, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function Header() {
   const { viewId, orgId } = useParams<{ viewId: string; orgId: string }>();
   const router = useRouter();
   const { workspaceId, currentUserId, views } = useLiveViews();
   const { issues, projects } = useIssuesStore();
   const { openPanel, togglePanel } = useRightPanelStore();
   const [deleting, setDeleting] = useState(false);
   const [error, setError] = useState<string>();
   const view = views.find((entry) => entry.id === viewId);
   const isIssue = view?.entityType === 'issue';
   const count = view
      ? view.entityType === 'issue'
         ? viewIssues(view, issues).length
         : viewProjects(view, projects).length
      : 0;
   const canDelete = Boolean(view && currentUserId === view.createdBy.id);
   const removeView = async () => {
      if (!view || !workspaceId || !canDelete || !window.confirm(`Delete ${view.name}?`)) return;
      setDeleting(true);
      setError(undefined);
      try {
         const response = await fetch(
            `${api}/views/${view.id}?${new URLSearchParams({ workspaceId })}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) throw new Error('Could not delete saved view.');
         router.push(`/${orgId}/views`);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not delete saved view.');
      } finally {
         setDeleting(false);
      }
   };
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
               {canDelete ? (
                  <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                        <Button
                           size="xs"
                           variant="ghost"
                           className="size-6 p-0"
                           aria-label="Saved view actions"
                           disabled={deleting}
                        >
                           <MoreHorizontal className="size-3.5 text-muted-foreground" />
                        </Button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="start">
                        <DropdownMenuItem
                           variant="destructive"
                           disabled={deleting}
                           onClick={() => void removeView()}
                        >
                           <Trash2 className="size-4" />
                           {deleting ? 'Deleting…' : 'Delete view'}
                        </DropdownMenuItem>
                     </DropdownMenuContent>
                  </DropdownMenu>
               ) : (
                  <MoreHorizontal className="size-3.5 text-muted-foreground shrink-0" />
               )}
            </div>
         </div>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <span className="text-xs text-muted-foreground">
               {count} {view?.entityType === 'project' ? 'projects' : 'issues'}
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
            {error && <span className="text-xs text-destructive">{error}</span>}
         </div>
      </div>
   );
}
