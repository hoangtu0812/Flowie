'use client';

import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { cn } from '@/lib/utils';
import { useLiveProject } from '@/components/common/projects/details/use-live-project';
import { useRightPanelStore } from '@/store/right-panel-store';
import { BarChart3, ChevronRight, Link2, PanelRight, Star } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { toast } from 'sonner';

const PROJECT_TABS = [
   { label: 'Overview', segment: 'overview' },
   { label: 'Activity', segment: 'activity' },
   { label: 'Issues', segment: 'issues' },
];

function ProjectTabs({ projectId }: { projectId: string }) {
   const { orgId } = useParams<{ orgId: string }>();
   const pathname = usePathname();

   return (
      <div className="flex items-center gap-1">
         {PROJECT_TABS.map((tab) => {
            const href = `/${orgId}/project/${projectId}/${tab.segment}`;
            const isActive = pathname === href;
            return (
               <Link
                  key={tab.segment}
                  href={href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                     'px-2.5 h-7 inline-flex items-center rounded-full border text-xs font-medium transition-colors',
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
   const { openPanel, togglePanel } = useRightPanelStore();

   return (
      <div className="flex items-center gap-1">
         <Button
            size="xs"
            variant={openPanel === 'insights' ? 'secondary' : 'ghost'}
            onClick={() => togglePanel('insights')}
            aria-label="Toggle insights panel"
         >
            <BarChart3 className="size-4" />
         </Button>
         <Button
            size="xs"
            variant={openPanel === 'hidden' ? 'ghost' : 'secondary'}
            onClick={() => togglePanel('hidden')}
            aria-label="Toggle side panel"
         >
            <PanelRight className="size-4" />
         </Button>
      </div>
   );
}

export default function Header({ projectId }: { projectId: string }) {
   const { orgId } = useParams<{ orgId: string }>();
   const { project, toggleFavorite } = useLiveProject(projectId);
   const isFavorite = Boolean(project?.favorites.length);

   const changeFavorite = async () => {
      try {
         await toggleFavorite(!isFavorite);
         toast.success(isFavorite ? 'Removed from favorites' : 'Added to favorites');
      } catch {
         toast.error('Could not update project favorite');
      }
   };

   const copyProjectLink = async () => {
      try {
         await navigator.clipboard.writeText(window.location.href);
         toast.success('Project link copied');
      } catch {
         toast.error('Could not copy the project link');
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
                     Projects
                  </Link>
                  <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  <span className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0">
                     <span className="text-xs">📁</span>
                  </span>
                  <span className="font-medium truncate">{project?.name ?? 'Project'}</span>
                  <Button
                     variant="ghost"
                     size="icon"
                     className="size-6 text-muted-foreground"
                     title={isFavorite ? 'Unfavorite project' : 'Favorite project'}
                     aria-label={isFavorite ? 'Unfavorite project' : 'Favorite project'}
                     onClick={() => void changeFavorite()}
                  >
                     <Star className={cn('size-3.5', isFavorite && 'fill-current')} />
                  </Button>
               </div>
            </div>
            <div className="flex items-center gap-1">
               <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  aria-label="Copy project link"
                  onClick={() => void copyProjectLink()}
               >
                  <Link2 className="size-4" />
               </Button>
            </div>
         </div>
         <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
            <ProjectTabs projectId={projectId} />
            <PanelToggles />
         </div>
      </>
   );
}
