'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/navigation/messages.vi';

import { CyclePlayIcon } from '@/components/common/cycles/cycle-line';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { isOpenedFromProject, issueHref } from '@/lib/issue-route';
import { cn } from '@/lib/utils';
import { useIssueActionDialogStore } from '@/store/issue-action-dialog-store';
import { useIssuesStore } from '@/store/issues-store';
import {
   ArrowRightLeft,
   Bell,
   BellOff,
   CalendarClock,
   ChevronDown,
   ChevronRight,
   ChevronUp,
   Link2,
   MoreHorizontal,
   PenLine,
   Star,
   Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

/**
 * Issue page header: breadcrumb (team › cycle › identifier + title, or
 * project › identifier + title when opened from a project page) and
 * previous / next navigation across the issue list.
 * VI: Header trang issue: breadcrumb (team › cycle › mã + tiêu đề, hoặc
 * dự án › mã + tiêu đề khi mở từ trang dự án) và nút issue trước / sau
 * trong danh sách issue.
 */
export default function HeaderNav() {
   const tx = useMessages(messages);

   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const { issues, teams, cycles, updateIssueFavorite, updateIssueSubscription } = useIssuesStore();
   const openIssueAction = useIssueActionDialogStore((state) => state.openForIssue);
   const index = issues.findIndex((candidate) => candidate.identifier === issueId);
   const issue = index >= 0 ? issues[index] : undefined;
   // Opened from a project page: the project replaces the team-scoped crumbs,
   // and previous / next keep the marker so the way back stays the same.
   // VI: Mở từ trang dự án: dự án thay cho các crumb theo team, và nút trước /
   // sau giữ dấu này để đường quay lại không đổi.
   const fromProject = isOpenedFromProject(useSearchParams());
   const project = fromProject ? issue?.project : undefined;
   const team = project ? undefined : teams.find((candidate) => candidate.id === issue?.teamId);
   const cycle =
      !project && issue?.cycleId
         ? cycles.find((candidate) => candidate.id === issue.cycleId)
         : undefined;

   const previousIssue = index > 0 ? issues[index - 1] : undefined;
   const nextIssue = index >= 0 && index < issues.length - 1 ? issues[index + 1] : undefined;

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10 gap-4">
         <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger />
            {team && (
               <Link
                  // The crumb goes back to the list the issue was opened from,
                  // not to a team landing page nobody navigated through.
                  href={`/${orgId}/team/${team.identifier}/all`}
                  className="flex items-center gap-1.5 shrink-0 hover:opacity-80"
               >
                  <div className="inline-flex size-5 bg-muted/50 items-center justify-center rounded shrink-0 text-xs">
                     {team.icon}
                  </div>
                  <span className="text-sm font-medium hidden md:inline">{team.name}</span>
               </Link>
            )}
            {project && (
               <Link
                  href={`/${orgId}/project/${project.id}/issues`}
                  className="flex items-center gap-1.5 shrink-0 hover:opacity-80"
               >
                  <project.icon size={16} className="shrink-0" />
                  <span className="text-sm font-medium hidden md:inline">{project.name}</span>
               </Link>
            )}
            {issue && !team && !project && (
               <Link
                  href={`/${orgId}/issues`}
                  className="shrink-0 text-sm text-muted-foreground hover:text-foreground"
               >
                  {tx('All issues')}
               </Link>
            )}
            {cycle && (
               <>
                  <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  <Link
                     href={`/${orgId}/team/${team?.identifier ?? ''}/cycles`}
                     className="hidden sm:flex items-center gap-1.5 shrink-0 text-sm text-muted-foreground hover:text-foreground"
                  >
                     <CyclePlayIcon className="size-3.5" />
                     {cycle.name}
                  </Link>
               </>
            )}
            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
            {issue && (
               <span className="text-sm min-w-0 truncate">
                  <span className="font-medium text-muted-foreground mr-1.5">
                     {issue.identifier}
                  </span>
                  <span className="font-medium">{issue.title}</span>
               </span>
            )}
            {issue && (
               <>
                  <button
                     type="button"
                     aria-label={
                        issue.isFavorite ? tx('Remove from favorites') : tx('Add to favorites')
                     }
                     className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                     onClick={() => void updateIssueFavorite(issue.id, !issue.isFavorite)}
                  >
                     <Star
                        className={cn(
                           'size-3.5',
                           issue.isFavorite && 'fill-current text-amber-400'
                        )}
                     />
                  </button>
                  <DropdownMenu>
                     <DropdownMenuTrigger asChild>
                        <button
                           type="button"
                           aria-label={tx('Issue actions')}
                           className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        >
                           <MoreHorizontal className="size-3.5" />
                        </button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem onClick={() => openIssueAction(issue.id, 'rename')}>
                           <PenLine className="size-4" /> {tx('Rename...')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openIssueAction(issue.id, 'due-date')}>
                           <CalendarClock className="size-4" /> {tx('Set due date...')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openIssueAction(issue.id, 'move')}>
                           <ArrowRightLeft className="size-4" /> {tx('Move to team...')}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                           onClick={() =>
                              void updateIssueSubscription(issue.id, !issue.isSubscribed)
                           }
                        >
                           {issue.isSubscribed ? (
                              <>
                                 <BellOff className="size-4" /> {tx('Unsubscribe')}
                              </>
                           ) : (
                              <>
                                 <Bell className="size-4" /> {tx('Subscribe')}
                              </>
                           )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                           onClick={() => {
                              void navigator.clipboard
                                 .writeText(window.location.href)
                                 .then(() => toast.success(tx('Issue link copied')))
                                 .catch(() => toast.error(tx('Could not copy the link.')));
                           }}
                        >
                           <Link2 className="size-4" /> {tx('Copy link')}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                           variant="destructive"
                           onClick={() => openIssueAction(issue.id, 'archive')}
                        >
                           <Trash2 className="size-4" /> {tx('Delete...')}
                        </DropdownMenuItem>
                     </DropdownMenuContent>
                  </DropdownMenu>
               </>
            )}
         </div>

         <div className="flex items-center gap-1 shrink-0">
            {index >= 0 && (
               <span className="text-xs text-muted-foreground mr-1">
                  {index + 1} / {issues.length}
               </span>
            )}
            <Button
               variant="ghost"
               size="icon"
               className="size-6"
               aria-label={tx('Previous issue')}
               disabled={!previousIssue}
               asChild={!!previousIssue}
            >
               {previousIssue ? (
                  <Link
                     href={issueHref(orgId, previousIssue.identifier, fromProject)}
                     aria-label={tx('Previous issue')}
                  >
                     <ChevronUp className="size-4" />
                  </Link>
               ) : (
                  <ChevronUp className="size-4" />
               )}
            </Button>
            <Button
               variant="ghost"
               size="icon"
               className="size-6"
               aria-label={tx('Next issue')}
               disabled={!nextIssue}
               asChild={!!nextIssue}
            >
               {nextIssue ? (
                  <Link
                     href={issueHref(orgId, nextIssue.identifier, fromProject)}
                     aria-label={tx('Next issue')}
                  >
                     <ChevronDown className="size-4" />
                  </Link>
               ) : (
                  <ChevronDown className="size-4" />
               )}
            </Button>
         </div>
      </div>
   );
}
