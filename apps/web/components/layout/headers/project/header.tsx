'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/navigation/messages.vi';

import { AiScheduleDialog } from '@/components/common/projects/details/ai-schedule-dialog';
import { ProjectSettingsDialog } from '@/components/common/projects/details/project-settings-dialog';
import { projectIcon } from '@/components/common/projects/project-icon';
import { IssueListActions } from '@/features/issues/issue-list-actions';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useLiveProjectData } from '@/components/common/projects/details/use-live-project';
import { cn } from '@/lib/utils';
import { useRightPanelStore } from '@/store/right-panel-store';
import { DisplayOptions } from '../display-options';
import {
   BarChart3,
   ChevronRight,
   Link2,
   MoreHorizontal,
   PanelRight,
   Settings,
   Star,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

const PROJECT_TABS = [
   { label: 'Overview', segment: 'overview' },
   { label: 'Activity', segment: 'activity' },
   { label: 'Issues', segment: 'issues' },
   { label: 'Timeline', segment: 'timeline' },
   { label: 'Docs', segment: 'docs' },
];

function ProjectTabs({ projectId }: { projectId: string }) {
   // Tabs reuse the key in the address bar (the slug once the route has redirected), so the
   // active tab matches the current path and switching tabs needs no redirect.
   // VI: Tab dùng lại khoá trên thanh địa chỉ (là slug sau khi route đã chuyển hướng), để tab đang
   // VI: mở khớp với path hiện tại và đổi tab không cần chuyển hướng.
   const { orgId, projectId: key } = useParams<{ orgId: string; projectId?: string }>();
   const pathname = usePathname();

   return (
      <div className="flex items-center gap-1 min-w-0 overflow-x-auto">
         {PROJECT_TABS.map((tab) => {
            const href = `/${orgId}/project/${key ?? projectId}/${tab.segment}`;
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
                  {tab.label}
               </Link>
            );
         })}
      </div>
   );
}

function PanelToggles() {
   const tx = useMessages(messages);

   const pathname = usePathname();
   const { openPanel, togglePanel } = useRightPanelStore();

   return (
      <div className="flex items-center gap-1 shrink-0">
         {pathname.endsWith('/issues') && (
            <>
               <AiScheduleDialog />
               <DisplayOptions />
               <IssueListActions />
            </>
         )}
         <Button
            size="xs"
            variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
            onClick={() => togglePanel('insights')}
            aria-label={tx('Toggle insights panel')}
         >
            <BarChart3 className="size-4" />
         </Button>
         <Button
            size="xs"
            variant={openPanel === 'hidden' ? 'ghost' : 'secondary'}
            onClick={() => togglePanel('hidden')}
            aria-label={tx('Toggle side panel')}
         >
            <PanelRight className="size-4" />
         </Button>
      </div>
   );
}

export default function Header({ projectId }: { projectId: string }) {
   const tx = useMessages(messages);

   const { orgId } = useParams<{ orgId: string }>();
   const { project, toggleFavorite } = useLiveProjectData();
   const favorited = Boolean(project?.favorites.length);
   const [settingsOpen, setSettingsOpen] = useState(false);
   const ProjectIcon = projectIcon(project?.icon);

   const onToggleFavorite = async () => {
      try {
         await toggleFavorite(!favorited);
      } catch (caught) {
         toast.error(
            caught instanceof Error ? caught.message : 'Could not update project favorite.'
         );
      }
   };

   const copyProjectLink = async () => {
      try {
         await navigator.clipboard.writeText(window.location.href);
         toast.success(tx('Project link copied.'));
      } catch {
         toast.error(tx('Could not copy the project link.'));
      }
   };

   return (
      <>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <div className="flex items-center gap-2 min-w-0">
               <SidebarTrigger className="" />
               <div className="flex items-center gap-1.5 text-sm min-w-0">
                  <Link
                     href={`/${orgId}/projects`}
                     className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                     {tx('Projects')}
                  </Link>
                  <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0">
                     <ProjectIcon className="size-3.5" />
                  </span>
                  <span className="font-medium truncate">{project?.name ?? 'Project'}</span>
                  <Button
                     variant="ghost"
                     size="icon"
                     className="size-6 text-muted-foreground"
                     onClick={() => void onToggleFavorite()}
                     aria-label={
                        favorited
                           ? tx('Remove project from favorites')
                           : tx('Add project to favorites')
                     }
                  >
                     <Star
                        className={cn('size-3.5', favorited && 'fill-current text-foreground')}
                     />
                  </Button>
               </div>
            </div>
            <div className="flex items-center gap-1">
               <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={() => void copyProjectLink()}
                  aria-label={tx('Copy project link')}
               >
                  <Link2 className="size-4" />
               </Button>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground"
                        aria-label={tx('Project actions')}
                     >
                        <MoreHorizontal className="size-4" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                     <DropdownMenuItem disabled={!project} onSelect={() => setSettingsOpen(true)}>
                        <Settings className="size-4" /> {tx('Project settings')}
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
               <ProjectSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
            </div>
         </div>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <ProjectTabs projectId={projectId} />
            <PanelToggles />
         </div>
      </>
   );
}
