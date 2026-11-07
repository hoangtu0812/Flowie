import React from 'react';
import { AppSidebar } from '@/components/layout/sidebar/app-sidebar';
import { HelpCenter } from '@/components/layout/sidebar/help-button';
import { SidebarProvider } from '@/components/ui/sidebar';
import { CreateIssueModalProvider } from '@/components/common/issues/create-issue-modal-provider';
import { IssueActionDialog } from '@/components/common/issues/issue-action-dialog';
import { IssueRelationDialog } from '@/components/common/issues/issue-relation-dialog';
import { CommandPalette } from '@/components/layout/command-palette';
import { BodyInteractionGuard } from '@/components/layout/body-interaction-guard';
import { PresenceHeartbeat } from '@/components/common/presence-heartbeat';
import { PreferenceSync } from '@/features/identity/preference-sync';
import { ReleaseAnnouncement } from '@/features/identity/release-announcement';
import { WorkspaceCanonicalRoute } from '@/components/layout/workspace-canonical-route';

/**
 * The workspace shell lives in a route layout, not in the page, so moving
 * between two routes keeps one sidebar, one command palette and one set of
 * dialogs mounted. Rendered per page it was torn down and rebuilt on every
 * navigation — the workspace and team queries behind it ran again each time,
 * and the sidebar visibly reassembled as though the browser had reloaded.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
   return (
      <SidebarProvider>
         <WorkspaceCanonicalRoute />
         <BodyInteractionGuard />
         <PresenceHeartbeat />
         <PreferenceSync />
         <CreateIssueModalProvider />
         <IssueActionDialog />
         <IssueRelationDialog />
         <CommandPalette />
         <AppSidebar />
         {/* Always-mounted dialogs sit after the navigation chrome: a closed dialog
             still contributes its frame and close control to the document, and
             keeping both in one place leaves the shell's real controls first.
             VI: Các dialog luôn mount nằm sau phần khung điều hướng: một dialog
             đang đóng vẫn góp khung và nút đóng của nó vào tài liệu, nên đặt cả
             hai cùng một chỗ giữ cho các control thật của khung app đứng trước. */}
         <HelpCenter />
         <ReleaseAnnouncement />
         <div className="h-svh overflow-hidden lg:p-2 w-full">
            <div className="lg:border lg:rounded-md overflow-hidden flex flex-col items-center justify-start bg-container h-full w-full">
               {children}
            </div>
         </div>
      </SidebarProvider>
   );
}
