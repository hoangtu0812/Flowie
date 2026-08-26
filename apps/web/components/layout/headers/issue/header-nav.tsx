'use client';

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
import { useParams } from 'next/navigation';
import { toast } from 'sonner';

/**
 * Issue page header: breadcrumb (team › cycle › identifier + title) and
 * previous / next navigation across the issue list.
 */
export default function HeaderNav() {
   const { orgId, issueId } = useParams<{ orgId: string; issueId: string }>();
   const { issues, teams, cycles, updateIssueFavorite, updateIssueSubscription } = useIssuesStore();
   const openIssueAction = useIssueActionDialogStore((state) => state.openForIssue);
   const index = issues.findIndex((candidate) => candidate.identifier === issueId);
   const issue = index >= 0 ? issues[index] : undefined;
   const team = teams.find((candidate) => candidate.id === issue?.teamId);
   const cycle = issue?.cycleId
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
                     aria-label={issue.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
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
                           aria-label="Issue actions"
                           className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                        >
                           <MoreHorizontal className="size-3.5" />
                        </button>
                     </DropdownMenuTrigger>
                     <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem onClick={() => openIssueAction(issue.id, 'rename')}>
                           <PenLine className="size-4" /> Rename...
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openIssueAction(issue.id, 'due-date')}>
                           <CalendarClock className="size-4" /> Set due date...
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => openIssueAction(issue.id, 'move')}>
                           <ArrowRightLeft className="size-4" /> Move to team...
                        </DropdownMenuItem>
                        <DropdownMenuItem
                           onClick={() =>
                              void updateIssueSubscription(issue.id, !issue.isSubscribed)
                           }
                        >
                           {issue.isSubscribed ? (
                              <>
                                 <BellOff className="size-4" /> Unsubscribe
                              </>
                           ) : (
                              <>
                                 <Bell className="size-4" /> Subscribe
                              </>
                           )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                           onClick={() => {
                              void navigator.clipboard
                                 .writeText(window.location.href)
                                 .then(() => toast.success('Issue link copied'))
                                 .catch(() => toast.error('Could not copy the link.'));
                           }}
                        >
                           <Link2 className="size-4" /> Copy link
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                           variant="destructive"
                           onClick={() => openIssueAction(issue.id, 'archive')}
                        >
                           <Trash2 className="size-4" /> Delete...
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
               disabled={!previousIssue}
               asChild={!!previousIssue}
            >
               {previousIssue ? (
                  <Link
                     href={`/${orgId}/issue/${previousIssue.identifier}`}
                     aria-label="Previous issue"
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
               disabled={!nextIssue}
               asChild={!!nextIssue}
            >
               {nextIssue ? (
                  <Link href={`/${orgId}/issue/${nextIssue.identifier}`} aria-label="Next issue">
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
