'use client';

import { useRef, useState } from 'react';
import { usePathname, useParams } from 'next/navigation';
import { Bug, Download, ListChecks, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuTrigger,
   DropdownMenuContent,
   DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { DesignSurface } from '@/components/common/design-surface';
import { useIssueExport } from '@/features/data-exchange/use-issue-export';
import { useIssuesStore } from '@/store/issues-store';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';
import { BugReport } from './bug-report';
import { BulkIssueActions } from './bulk-issue-actions';

/** Keeps optional list commands in the existing toolbar and resets dialogs with their scope. */
export function IssueListActions({ hasBugReport = false }: { hasBugReport?: boolean }) {
   const pathname = usePathname();
   const { workspaceId, accountId, pageQuery, loadScope, loading, error } = useIssuesStore();
   if (!workspaceId || !pageQuery || error) return null;
   return (
      <ListActions
         key={`${pathname}:${accountId}:${workspaceId}:${loadScope}:${pageQuery}`}
         workspace={workspaceId}
         query={pageQuery}
         disabled={loading}
         hasBugReport={hasBugReport}
      />
   );
}

function ListActions({
   workspace,
   query,
   disabled,
   hasBugReport,
}: {
   workspace: string;
   query: string;
   disabled: boolean;
   hasBugReport: boolean;
}) {
   const tx = useMessages(messages);
   const [dialog, setDialog] = useState<'bulk' | 'bugs'>();
   const trigger = useRef<HTMLButtonElement>(null);
   const pendingDialog = useRef<'bulk' | 'bugs' | undefined>(undefined);
   const changeDialog = (kind: 'bulk' | 'bugs', open: boolean) => {
      setDialog(open ? kind : undefined);
      // The native dialog's original menu item disappears when the Radix menu closes.
      // Restore the persistent toolbar trigger after the native dialog has closed.
      if (!open) window.requestAnimationFrame(() => trigger.current?.focus());
   };
   const { teamId } = useParams<{ teamId?: string }>();
   const { run, busy } = useIssueExport(workspace, query);
   return (
      <>
         <DropdownMenu>
            <DropdownMenuTrigger asChild>
               <Button
                  ref={trigger}
                  variant="ghost"
                  size="xs"
                  className="shrink-0"
                  disabled={disabled || busy}
                  aria-label={busy ? tx('Exporting issues…') : tx('Issue actions')}
                  title={tx('Issue actions')}
               >
                  <MoreHorizontal className="size-4" />
               </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
               align="end"
               onCloseAutoFocus={(event) => {
                  const next = pendingDialog.current;
                  pendingDialog.current = undefined;
                  if (!next || !trigger.current?.isConnected) return;
                  // Open after the menu focus scope unmounts so its closing layer cannot consume Escape.
                  event.preventDefault();
                  trigger.current.focus();
                  setDialog(next);
               }}
            >
               <DropdownMenuItem
                  onSelect={() => {
                     pendingDialog.current = 'bulk';
                  }}
               >
                  <ListChecks />
                  {tx('Bulk changes')}
               </DropdownMenuItem>
               <DropdownMenuItem onSelect={() => void run()}>
                  <Download />
                  {tx('Export matching issues CSV')}
               </DropdownMenuItem>
               {hasBugReport && (
                  <DropdownMenuItem
                     onSelect={() => {
                        pendingDialog.current = 'bugs';
                     }}
                  >
                     <Bug />
                     {tx('Bug report')}
                  </DropdownMenuItem>
               )}
            </DropdownMenuContent>
         </DropdownMenu>
         <DesignSurface>
            <BulkIssueActions
               open={dialog === 'bulk'}
               onOpenChange={(open) => changeDialog('bulk', open)}
            />
            {hasBugReport && (
               <BugReport
                  teamReference={teamId}
                  open={dialog === 'bugs'}
                  onOpenChange={(open) => changeDialog('bugs', open)}
               />
            )}
         </DesignSurface>
      </>
   );
}
